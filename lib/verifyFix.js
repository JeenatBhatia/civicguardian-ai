// lib/verifyFix.js
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY);
const MODEL = 'gemini-2.5-flash-lite';

// Browser File -> Gemini inline image part
async function fileToPart(file) {
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  return { inlineData: { data: base64, mimeType: file.type || 'image/jpeg' } };
}

// Public Cloudinary URL -> Gemini inline image part
async function urlToPart(url) {
  const res = await fetch(url);
  const blob = await res.blob();
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  return { inlineData: { data: base64, mimeType: blob.type || 'image/jpeg' } };
}

const CATEGORY_HINTS = {
  pothole: 'The road surface should now be filled, level, and drivable. A properly patched hole counts as resolved; a still-visible hole does not.',
  garbage: 'The area should be cleared of the garbage pile. A few stray pieces are acceptable; a remaining pile is NOT resolved.',
  water_leak: 'Water should no longer be leaking or pooling. A dry, sealed pipe or joint indicates resolved.',
  streetlight: 'The light fixture should be repaired or replaced. A visibly new/intact or lit fixture indicates resolved.',
  drainage: 'The drain should be unblocked and clear of standing water and debris.',
  other: 'The originally reported problem should no longer be visible.',
};

// before = original Cloudinary imageUrl, afterFile = the worker's uploaded File
export async function verifyFix({ beforeUrl, afterFile, category, description }) {
  const prompt = `You are a strict civic infrastructure inspector deciding whether a reported problem has actually been fixed.

You are given two images:
- IMAGE 1 = the ORIGINAL report photo of a reported "${category}" issue.
- IMAGE 2 = an AFTER photo submitted by a field worker who claims it is now fixed.

Reported problem: "${description}"
Fix criteria for this category: ${CATEGORY_HINTS[category] || CATEGORY_HINTS.other}

Decide conservatively:
1. Do both photos appear to show the SAME location/object? If image 2 is clearly a different place, set sameLocation=false and verdict="wrong_photo".
2. If the same location, is the reported problem genuinely resolved?
   - "resolved": the problem is clearly gone and the fix criteria are met.
   - "partially_resolved": some improvement but the problem is still partly present.
   - "not_resolved": the problem is still clearly visible, OR the photo is too blurry/dark to confirm.
3. Only return "resolved" when you are confident. When in doubt, never mark resolved.

Respond ONLY with this JSON, no markdown:
{
  "sameLocation": true,
  "verdict": "resolved",
  "confidence": 0.9,
  "reasoning": "one or two sentences explaining your decision",
  "remainingProblems": ["list any problems still visible, or empty array"]
}`;

  const model = genAI.getGenerativeModel({ model: MODEL });
  const [beforePart, afterPart] = await Promise.all([urlToPart(beforeUrl), fileToPart(afterFile)]);

  const result = await model.generateContent([prompt, beforePart, afterPart]);
  const clean = result.response.text().replace(/```json|```/g, '').trim();

  try {
    const parsed = JSON.parse(clean);
    return {
      sameLocation: parsed.sameLocation !== false,
      verdict: parsed.verdict || 'not_resolved',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      reasoning: parsed.reasoning || 'No reasoning returned.',
      remainingProblems: Array.isArray(parsed.remainingProblems) ? parsed.remainingProblems : [],
    };
  } catch {
    // If parsing fails, fail safe — do NOT auto-close.
    return {
      sameLocation: true,
      verdict: 'not_resolved',
      confidence: 0.3,
      reasoning: 'Could not parse AI response; manual review needed.',
      remainingProblems: [],
    };
  }
}