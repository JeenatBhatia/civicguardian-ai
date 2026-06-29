import { GoogleGenerativeAI } from "@google/generative-ai";
const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY);

/* =====================================================
   Gemini Retry Helper
===================================================== */

async function generateContentWithRetry(model, content, retries = 3) {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await model.generateContent(content);
    } catch (error) {
      lastError = error;

      const message = error?.message || "";

      // Retry only if Gemini is temporarily overloaded
      if (message.includes("503") || message.includes("high demand")) {
        console.log(`Gemini busy... Retry ${attempt}/${retries}`);

        await new Promise((resolve) => setTimeout(resolve, attempt * 2000));

        continue;
      }

      throw error;
    }
  }

  throw lastError;
}

// Convert image file to base64 for Gemini Vision
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;

    reader.readAsDataURL(file);
  });
}

/* =====================================================
   STEP 1: AI Issue Detection Agent
===================================================== */
export async function classifyIssue(imageFile) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
  });

  const base64 = await fileToBase64(imageFile);

  const prompt = `You are an AI assistant for a civic issue reporting platform.

Analyze this image and respond ONLY in this exact JSON format:

{
  "category": "one of: pothole, streetlight, drainage, garbage, water_leak, other",
  "severity": "number from 1 to 5 where 5 is most urgent",
  "title": "short title under 8 words",
  "description": "2 sentence description of the issue",
  "department": "one of: PWD, Municipal Corporation, NHAI, Water Department, Electricity Board",
  "confidence": "high or medium or low"
}`;

  const result = await generateContentWithRetry(model, [
    prompt,
    {
      inlineData: {
        mimeType: imageFile.type,
        data: base64,
      },
    },
  ]);

  const text = result.response.text();
  const clean = text.replace(/```json|```/g, "").trim();

  return JSON.parse(clean);
}

/* =====================================================
   STEP 2: AI Complaint Generator
===================================================== */
export async function generateComplaint(issueData, location) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
  });

  const prompt = `Write a formal complaint letter to the ${issueData.department} about this civic issue.

Issue: ${issueData.title}
Description: ${issueData.description}
Location: ${location}
Severity: ${issueData.severity}/5

Write a professional, concise 3-paragraph letter.

Include:
- Subject line at top
- Clear description of the problem
- Request for urgent action
- Timeline expectation based on severity
  (5 = within 24 hrs, 4 = 3 days, 3 = 1 week)

Sign it as:
"Concerned Citizen via Community Hero Platform"`;

  const result = await generateContentWithRetry(model, prompt);

  return result.response.text();
}

/* =====================================================
   STEP 3: Priority Score Engine
===================================================== */
export function calculatePriority(severity, upvotes, reportedAt) {
  const hoursSinceReport = (Date.now() - reportedAt) / (1000 * 60 * 60);

  const urgencyBoost = Math.min(hoursSinceReport / 24, 2);

  return Math.round(severity * 20 + upvotes * 2 + urgencyBoost);
}

/* =====================================================
   STEP 4: Impact Score Agent
===================================================== */
export async function calculateImpactScore(issueData) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
  });

  const prompt = `You are an AI scoring civic issues for impact.

Given this issue, respond ONLY in this exact JSON format:

{
  "safetyRisk": 0,
  "populationAffected": 0,
  "trafficDisruption": 0,
  "severityScore": 0,
  "totalImpactScore": 0,
  "impactSummary": "one sentence explaining why this score"
}

Issue category: ${issueData.category}
Issue title: ${issueData.title}
Issue description: ${issueData.description}
Severity: ${issueData.severity}/5`;

  const result = await generateContentWithRetry(model, prompt);

  const text = result.response.text();

  const clean = text.replace(/```json|```/g, "").trim();

  return JSON.parse(clean);
}

/* =====================================================
   STEP 5: Duplicate Complaint Agent
===================================================== */
export async function checkDuplicate(newIssue, existingIssues) {
  if (!existingIssues?.length) {
    return null;
  }

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
  });

  const prompt = `You are checking if a new civic complaint is a duplicate of existing complaints.

New complaint:

Title: ${newIssue.title}
Category: ${newIssue.category}
Location: ${newIssue.location}
Description: ${newIssue.description}

Existing complaints:

${existingIssues
  .slice(0, 10)
  .map(
    (issue, index) =>
      `${index + 1}. Title: ${issue.title}, Category: ${
        issue.category
      }, Location: ${issue.location}`
  )
  .join("\n")}

Respond ONLY in this exact JSON format:

{
  "isDuplicate": true,
  "matchIndex": 1,
  "confidence": "high",
  "reason": "short explanation"
}`;

  const result = await generateContentWithRetry(model, prompt);

  const text = result.response.text();

  const clean = text.replace(/```json|```/g, "").trim();

  return JSON.parse(clean);
}

/* =====================================================
   STEP 6: Resolution Recommendation Agent
===================================================== */
export async function generateResolutionPlan(issueData, impactScore) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
  });

  const prompt = `You are an AI assistant for municipal authorities.

Generate a resolution plan for this civic issue.

Respond ONLY in this exact JSON format:

{
  "recommendedAction": "",
  "priority": "Critical",
  "department": "${issueData.department}",
  "estimatedRepairTime": "",
  "riskIfDelayed": "",
  "requiredResources": ""
}

Issue: ${issueData.title}
Category: ${issueData.category}
Description: ${issueData.description}
Severity: ${issueData.severity}/5
Impact Score: ${impactScore}/100`;

  const result = await generateContentWithRetry(model, prompt);

  const text = result.response.text();

  const clean = text.replace(/```json|```/g, "").trim();

  return JSON.parse(clean);
}

/* =====================================================
   STEP 7: Emergency Escalation Agent
===================================================== */
export function checkEmergency(issueData) {
  const emergencyCategories = [
    "open manhole",
    "fallen electric pole",
    "major water leak",
    "water_leak",
    "other",
  ];

  const emergencyKeywords = [
    "manhole",
    "electric",
    "pole",
    "collapse",
    "flood",
    "fire",
    "gas",
    "explosion",
    "fallen",
  ];

  const titleLower = issueData.title?.toLowerCase() || "";

  const descLower = issueData.description?.toLowerCase() || "";

  const hasEmergencyKeyword = emergencyKeywords.some(
    (keyword) => titleLower.includes(keyword) || descLower.includes(keyword)
  );

  const isEmergencyCategory = emergencyCategories.includes(
    issueData.category?.toLowerCase()
  );

  return issueData.severity >= 4 || hasEmergencyKeyword || isEmergencyCategory;
}
//a
export async function generatePredictions(issues) {
  if (issues.length < 3) return [];
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const summary = issues
    .slice(0, 30)
    .map(
      (i) =>
        `category: ${i.category}, location: ${i.location}, severity: ${i.severity}, status: ${i.status}`
    )
    .join("\n");

  const prompt = `You are an AI analyst predicting future civic issues based on patterns.
Analyze these recent complaints and generate predictions.
Respond ONLY with a JSON array, nothing else:
[
  {
    "area": "area name from the location data",
    "prediction": "specific prediction of what will happen",
    "probability": "High or Medium or Low",
    "timeframe": "e.g. within 2 weeks or next month",
    "basedOn": "brief reason based on the data pattern",
    "category": "the issue category this relates to"
  }
]
Generate 2 to 3 predictions maximum.

Recent issues:
${summary}`;

  const result = await generateContentWithRetry(model, prompt);

  const text = result.response.text();
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

/* =====================================================
   STEP 8: Community Health AI Agent
===================================================== */

export async function generateCommunityBrief(issues) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
  });

  const total = issues.length;

  const potholes = issues.filter(i => i.category === "pothole").length;
  const garbage = issues.filter(i => i.category === "garbage").length;
  const drainage = issues.filter(i => i.category === "drainage").length;
  const streetlights = issues.filter(i => i.category === "streetlight").length;
  const leaks = issues.filter(i => i.category === "water_leak").length;

  const emergencies = issues.filter(
    i => i.isEmergency && i.status !== "resolved"
  ).length;

  const resolved = issues.filter(
    i => i.status === "resolved"
  ).length;

  const prompt = `
You are an AI civic health analyst.

Based on these community statistics, respond ONLY in JSON.

Statistics:

Total Issues: ${total}
Resolved: ${resolved}
Emergency Issues: ${emergencies}

Potholes: ${potholes}
Garbage: ${garbage}
Drainage: ${drainage}
Streetlights: ${streetlights}
Water Leaks: ${leaks}

Return ONLY this JSON:

{
 "overallHealth": 78,
 "roadQuality": 80,
 "cleanliness": 74,
 "safety": 82,
 "drainage": 69,
 "weeklyBrief":"One short paragraph.",
 "topConcern":"pothole"
}
`;

  const result = await generateContentWithRetry(model, prompt);

  const text = result.response.text();

  const clean = text
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();

  return JSON.parse(clean);
}
/* =====================================================
   STEP 9: AI Daily Action Queue Agent
===================================================== */

export async function generateActionQueue(issues) {
  if (!issues.length) return [];

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
  });

  const summary = issues
    .slice(0, 40)
    .map(
      (i) => `
Title: ${i.title}
Category: ${i.category}
Location: ${i.location}
Severity: ${i.severity}
Impact Score: ${i.impactScore || 0}
Status: ${i.status}
Department: ${i.department}
Emergency: ${i.isEmergency ? "Yes" : "No"}
`
    )
    .join("\n");

  const prompt = `
You are an autonomous municipal AI.

Your job is NOT to summarize issues.

Your job is to decide what the city should fix FIRST.

Analyze every issue.

Rank the most important work for today.

Return ONLY JSON.

[
{
"title":"Repair large potholes near Sector 15",
"priority":"Critical",
"department":"PWD",
"reason":"High accident risk due to multiple severe complaints.",
"estimatedTime":"4 hours",
"impact":"Very High"
}
]

Generate a maximum of 5 tasks.

Issues:

${summary}
`;

  const result = await generateContentWithRetry(
    model,
    prompt
  );

  const text = result.response.text();

  const clean = text
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();

  return JSON.parse(clean);
}
/* =====================================================
   STEP 10: Civic AI Assistant
===================================================== */

export async function askCommunityAI(question, issues) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
  });

  const summary = issues
    .slice(0, 50)
    .map(
      (i) => `
Title: ${i.title}
Category: ${i.category}
Location: ${i.location}
Severity: ${i.severity}
Impact Score: ${i.impactScore || 0}
Status: ${i.status}
Department: ${i.department}
Emergency: ${i.isEmergency ? "Yes" : "No"}
Upvotes: ${i.upvotes || 0}
`
    )
    .join("\n");

  const prompt = `
You are CivicGuardian AI.

You are an intelligent municipal assistant.

Answer ONLY using the issue data below.

If the answer cannot be determined from the data,
say so politely.

Keep answers under 120 words.

Community Issues:

${summary}

User Question:

${question}
`;

  const result = await generateContentWithRetry(model, prompt);

  return result.response.text();
}