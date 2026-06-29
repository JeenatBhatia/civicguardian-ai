// lib/predict.js
import { GoogleGenerativeAI } from '@google/generative-ai';
import { stageOf, STAGES } from '@/lib/issueLifecycle';

const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY);
const MODEL = 'gemini-2.5-flash-lite';

// Build a compact summary of current issues to feed the model.
function summarize(issues) {
  const open = issues.filter((i) => stageOf(i) !== STAGES.RESOLVED && stageOf(i) !== STAGES.DUPLICATE);
  const byCategory = {}, byLocation = {};
  open.forEach((i) => {
    byCategory[i.category] = (byCategory[i.category] || 0) + 1;
    const loc = (i.location || '').split(',')[0].trim() || 'Unknown';
    byLocation[loc] = (byLocation[loc] || 0) + 1;
  });
  return { open, byCategory, byLocation };
}

// Local fallback — always works, derived from the data itself.
function localPredictions(issues) {
  const { open, byCategory, byLocation } = summarize(issues);
  const topCat = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0];
  const topLoc = Object.entries(byLocation).sort((a, b) => b[1] - a[1])[0];
  const preds = [];

  if (topLoc) {
    preds.push({
      area: topLoc[0],
      risk: topLoc[1] >= 2 ? 'High' : 'Medium',
      category: topCat ? topCat[0] : 'general',
      prediction: `${topLoc[0]} has the highest concentration of open issues (${topLoc[1]}). Increased civic risk likely if not addressed soon.`,
      recommendation: `Prioritize an inspection team for ${topLoc[0]} this week.`,
      confidence: 70,
    });
  }
  if (topCat) {
    preds.push({
      area: 'Citywide',
      risk: topCat[1] >= 3 ? 'High' : 'Medium',
      category: topCat[0],
      prediction: `${topCat[0].replace('_', ' ')} is the most-reported issue type (${topCat[1]} open). Expect continued reports in this category.`,
      recommendation: `Allocate dedicated resources to ${topCat[0].replace('_', ' ')} repairs.`,
      confidence: 65,
    });
  }
  if (preds.length === 0) {
    preds.push({
      area: 'Citywide', risk: 'Low', category: 'general',
      prediction: 'No significant issue clusters detected. Community conditions are stable.',
      recommendation: 'Maintain routine monitoring.', confidence: 60,
    });
  }
  return { predictions: preds, openCount: open.length, source: 'local' };
}

export async function generatePredictions(issues) {
  const { open, byCategory, byLocation } = summarize(issues);

  // Nothing to predict from
  if (open.length === 0) return localPredictions(issues);

  const prompt = `You are CivicGuardian AI's predictive risk engine for a municipal authority in India.

Current OPEN civic issues: ${open.length}
By category: ${JSON.stringify(byCategory)}
By area: ${JSON.stringify(byLocation)}
Recent issue titles: ${open.slice(0, 8).map((i) => `${i.title} (${i.category}, sev ${i.severity}, ${i.location})`).join(' | ')}

Based ONLY on this data, predict 2-3 future civic risks. Identify which areas/categories are likely to worsen and give a concrete proactive recommendation for authorities. Be specific and actionable.

Respond ONLY with this JSON, no markdown:
{
  "predictions": [
    {
      "area": "area name or 'Citywide'",
      "risk": "High",
      "category": "issue category",
      "prediction": "one specific sentence about the predicted risk",
      "recommendation": "one concrete action for authorities",
      "confidence": 80
    }
  ]
}`;

  try {
    const model = genAI.getGenerativeModel({ model: MODEL });
    const result = await model.generateContent(prompt);
    const clean = result.response.text().replace(/```json|```/g, '').trim();
    const data = JSON.parse(clean);
    if (!Array.isArray(data.predictions) || data.predictions.length === 0) {
      return localPredictions(issues);
    }
    return { predictions: data.predictions, openCount: open.length, source: 'gemini' };
  } catch (e) {
    console.error('prediction failed, using local', e);
    return localPredictions(issues);
  }
}