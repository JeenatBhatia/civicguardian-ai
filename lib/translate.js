import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY);

export async function translateText(text, targetLang) {
  const langNames = {
    hi: 'Hindi',
    en: 'English',
    pa: 'Punjabi',
    ur: 'Urdu',
  };

  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const result = await model.generateContent(
    'Translate the following text to ' + langNames[targetLang] + '. ' +
    'Return ONLY the translated text, nothing else, no explanations:\n\n' + text
  );

  return result.response.text();
}