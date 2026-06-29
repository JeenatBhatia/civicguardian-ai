// lib/agentOrchestrator.js
import { GoogleGenerativeAI } from '@google/generative-ai';
import { classifyIssue, checkEmergency } from './gemini';

// Flash-Lite = 1,000 requests/day on the free tier (vs ~20 for 2.5-flash).
// Once you enable billing / move to a paid tier, you can switch this to
// 'gemini-2.5-flash' for slightly stronger vision. One-line swap.
const MODEL = 'gemini-2.5-flash-lite';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Browser-safe File -> Gemini inline image part (report page is a client component)
async function fileToGenerativePart(file) {
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  return { inlineData: { data: base64, mimeType: file.type || 'image/jpeg' } };
}

function isQuotaError(err) {
  const msg = (err?.message || '').toLowerCase();
  return (
    msg.includes('429') ||
    msg.includes('quota') ||
    msg.includes('exceeded') ||
    msg.includes('rate limit') ||
    msg.includes('resource_exhausted')
  );
}

// 503 "high demand" / overload — transient, worth one retry then fallback.
function isOverloadError(err) {
  const msg = (err?.message || '').toLowerCase();
  return (
    msg.includes('503') ||
    msg.includes('overloaded') ||
    msg.includes('high demand') ||
    msg.includes('unavailable')
  );
}

// Deterministic duplicate check — same category + same location area.
// Runs in plain code so it works even when Gemini is unavailable.
function findLocalDuplicate(category, location, existingIssues = []) {
  const loc = (location || '').toLowerCase().split(',')[0].trim(); // first part, e.g. "fatehabad"
  if (!loc || !category) return null;
  for (const i of existingIssues) {
    if (i.category !== category) continue;
    const iLoc = (i.location || '').toLowerCase().split(',')[0].trim();
    if (iLoc && iLoc === loc) {
      return {
        isDuplicate: true,
        confidence: 'high',
        reason: `A ${String(category).replace('_', ' ')} was already reported in ${i.location} ("${i.title}").`,
        matchTitle: i.title,
      };
    }
  }
  return null;
}

// Clamp impact numbers so they can never overflow the UI (sub-scores ≤25, total ≤100).
function clampImpact(impact) {
  if (!impact) return impact;
  const cap = (v, max) => Math.min(Math.max(Number(v) || 0, 0), max);
  impact.safetyRisk = cap(impact.safetyRisk, 25);
  impact.populationAffected = cap(impact.populationAffected, 25);
  impact.trafficDisruption = cap(impact.trafficDisruption, 25);
  impact.severityScore = cap(impact.severityScore, 25);
  const sum =
    impact.safetyRisk + impact.populationAffected + impact.trafficDisruption + impact.severityScore;
  let total = Number(impact.totalImpactScore) || 0;
  if (total <= 0 || total > 100) total = sum; // bad/missing total -> use sum of capped parts
  impact.totalImpactScore = cap(total, 100);
  return impact;
}

// Deterministic local results when Gemini is unavailable — keeps the app and the demo alive.
function buildLocalResults(classification, location, isEmergency, existingIssues = []) {
  const sev = classification.severity || 3;
  const localDup = findLocalDuplicate(classification.category, location, existingIssues);
  return {
    classification,
    isEmergency,
    impact: clampImpact({
      safetyRisk: Math.min(25, sev * 5),
      populationAffected: Math.min(25, sev * 4),
      trafficDisruption: Math.min(25, sev * 3),
      severityScore: Math.min(25, sev * 5),
      totalImpactScore: Math.min(100, sev * 18),
      impactSummary: 'Estimated locally from severity (AI service was unavailable).',
    }),
    duplicate:
      localDup || {
        isDuplicate: false,
        confidence: 'low',
        reason: 'No similar issues found nearby.',
      },
    resolution: {
      recommendedAction: 'Inspect on-site and carry out the appropriate repair.',
      priority: sev >= 4 ? 'Critical' : sev >= 3 ? 'High' : 'Medium',
      department: classification.department,
      estimatedRepairTime: sev >= 4 ? '1-2 days' : '2-4 days',
      riskIfDelayed: 'Issue may worsen and affect more residents if left unaddressed.',
      requiredResources: '2 field workers and standard repair materials.',
    },
    masterDecision: {
      finalPriority: sev >= 4 ? 'CRITICAL' : sev >= 3 ? 'HIGH' : 'MEDIUM',
      autoEscalate: isEmergency,
      assignedDepartment: classification.department,
      recommendedAction: 'Route to the assigned department for inspection.',
      citizenMessage:
        'Your report has been received and routed to the correct department. Thank you for helping improve your community.',
      authorityAlert: `New ${classification.category} report at ${location} requiring attention.`,
      estimatedResolutionDays: sev >= 4 ? '2' : '4',
      confidenceScore: 70,
      reasoning:
        'Generated locally from severity and category because the AI service was unavailable. Priority reflects the reported severity.',
    },
    complaint: `Subject: Civic Issue Report\n\nDear Commissioner,\n\nA ${classification.category} issue has been reported at ${location}. ${classification.description}\n\nWe request that the appropriate department inspect and resolve this within a reasonable timeline.\n\nRegards,\nConcerned Citizen via CivicGuardian AI`,
  };
}

// Generic default when we have no vision at all (full quota/overload outage).
function genericClassification() {
  return {
    title: 'Reported civic issue',
    category: 'other',
    severity: 3,
    description:
      'Issue reported by a citizen. AI image analysis was unavailable — please review and edit the details before submitting.',
    department: 'Municipal Corporation',
    confidence: 'low',
  };
}

export async function runAgentPipeline(imageFile, location, existingIssues = [], onStep) {
  const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: MODEL });

  const nearby =
    existingIssues.slice(0, 5).map((i) => `${i.title} at ${i.location}`).join(' | ') || 'none';

  const prompt = `You are CivicGuardian AI, an autonomous civic issue analysis system. Look at the attached photo of a civic infrastructure problem and run a complete multi-agent analysis in a single pass.

Location: ${location}
Nearby existing issues (for duplicate detection): ${nearby}

Allowed categories: pothole, water_leak, garbage, streetlight, drainage, other
Allowed departments: PWD, Water Department, Municipal Corporation, Electricity Department

First identify the issue from the image (title, category, severity 1-5, short description, responsible department). Then run impact analysis, duplicate detection, a resolution plan, and a final master decision. Keep "department", "resolution.department" and "masterDecision.assignedDepartment" consistent.

IMPORTANT: In the impact object, each of safetyRisk, populationAffected, trafficDisruption and severityScore must be a number from 0 to 25, and totalImpactScore must equal their sum (0 to 100). Never exceed these maximums.

Respond ONLY with this exact JSON, no markdown, no explanation:
{
  "title": "short descriptive title",
  "category": "one of the allowed categories",
  "severity": 4,
  "description": "1-2 sentence description of what is visible",
  "department": "one of the allowed departments",
  "confidence": "high",
  "impact": {
    "safetyRisk": 20,
    "populationAffected": 20,
    "trafficDisruption": 15,
    "severityScore": 20,
    "totalImpactScore": 75,
    "impactSummary": "one sentence about community impact"
  },
  "duplicate": {
    "isDuplicate": false,
    "confidence": "low",
    "reason": "explain whether any nearby issue matches this one"
  },
  "resolution": {
    "recommendedAction": "specific repair action",
    "priority": "High",
    "department": "same as top-level department",
    "estimatedRepairTime": "2 days",
    "riskIfDelayed": "what happens if not fixed soon",
    "requiredResources": "workers and materials needed"
  },
  "masterDecision": {
    "finalPriority": "HIGH",
    "autoEscalate": false,
    "assignedDepartment": "same as top-level department",
    "recommendedAction": "immediate action required",
    "citizenMessage": "thank you message with next steps for the citizen",
    "authorityAlert": "short alert message for the department",
    "estimatedResolutionDays": "3",
    "confidenceScore": 88,
    "reasoning": "Two sentences explaining the decision and priority level."
  },
  "complaint": "Subject: Civic Issue Report\\n\\nDear Commissioner,\\n\\nA <category> issue has been reported at ${location}. <description>\\n\\nWe request immediate action within the appropriate timeline.\\n\\nRegards,\\nConcerned Citizen via CivicGuardian AI"
}`;

  // ── HAPPY PATH: one call does vision + all six agents ──
  try {
    onStep('🔍 Gemini Vision analyzing image + running 6 agents...');
    const imagePart = await fileToGenerativePart(imageFile);

    let result;
    try {
      result = await model.generateContent([prompt, imagePart]);
    } catch (err) {
      if (isOverloadError(err)) {
        onStep('⏳ Model busy — retrying in a moment...');
        await sleep(2000);
        result = await model.generateContent([prompt, imagePart]); // one retry
      } else {
        throw err; // let the outer catch handle quota/other
      }
    }

    const clean = result.response.text().replace(/```json|```/g, '').trim();
    const data = JSON.parse(clean);

    const classification = {
      title: data.title,
      category: data.category,
      severity: data.severity,
      description: data.description,
      department: data.department,
      confidence: data.confidence || 'high',
    };
    const isEmergency = checkEmergency(classification);
    if (isEmergency) onStep('🚨 Emergency detected — auto-escalating...');
    onStep('✅ Analysis complete!');

    // Clamp impact so the score and bars can never overflow (136/100 bug fix)
    if (data.impact) clampImpact(data.impact);

    // Deterministic duplicate check beats the model's guess — and survives fallbacks
    const localDup = findLocalDuplicate(classification.category, location, existingIssues);
    const duplicateResult =
      localDup ||
      data.duplicate || {
        isDuplicate: false,
        confidence: 'low',
        reason: 'No similar issues found nearby.',
      };

    // Local results provide per-field fallback if the model returned a partial structure
    const local = buildLocalResults(classification, location, isEmergency, existingIssues);

    return {
      classification,
      isEmergency,
      impact: data.impact || local.impact,
      duplicate: duplicateResult,
      resolution: data.resolution || local.resolution,
      masterDecision: data.masterDecision || local.masterDecision,
      complaint: data.complaint || local.complaint,
    };
  } catch (err) {
    console.error('Merged pipeline call failed:', err);

    // ── FALLBACK ──
    if (isQuotaError(err) || isOverloadError(err)) {
      // Quota out or model overloaded — retrying again won't help. Go fully local so the demo survives.
      onStep(
        isQuotaError(err)
          ? '⚠️ Gemini quota reached — generating local analysis...'
          : '⚠️ Gemini busy — generating local analysis...'
      );
      const classification = genericClassification();
      return buildLocalResults(
        classification,
        location,
        checkEmergency(classification),
        existingIssues
      );
    }

    // Non-quota, non-overload failure (malformed JSON, transient, safety block): salvage with a vision-only call.
    try {
      onStep('↻ Retrying with vision-only analysis...');
      const classification = await classifyIssue(imageFile);
      const isEmergency = checkEmergency(classification);
      if (isEmergency) onStep('🚨 Emergency detected — auto-escalating...');
      onStep('✅ Vision complete (agents estimated locally).');
      return buildLocalResults(classification, location, isEmergency, existingIssues);
    } catch (err2) {
      console.error('Vision-only salvage failed:', err2);
      onStep('⚠️ AI unavailable — using local defaults. Please review the details.');
      const classification = genericClassification();
      return buildLocalResults(
        classification,
        location,
        checkEmergency(classification),
        existingIssues
      );
    }
  }
}