import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';

const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey });

const prompt = `You are an expert Korean receipt OCR and VIP limousine driver expense classification AI.
Carefully examine this receipt image and extract structured data for a corporate mobility expense report.

Driver context: "윤태준", Vehicle: "116허 1514".

CRITICAL INSTRUCTIONS:
- "amount": Must be the FINAL TOTAL payment/approved amount (합계/승인금액/받을금액), NEVER intermediate subtotal, VAT, discount amount, or balance.
- If multiple amounts appear, find the final card approval amount (신용카드 승인금액 / 결제금액).
- "merchant": Merchant name.
- "category": strictly one of: "fuel" | "toll" | "parking" | "meal" | "wash" | "maintenance" | "accommodation" | "transit" | "other".
- Return strictly a JSON object:
{
  "merchant": string,
  "address": string | null,
  "amount": number | null,
  "date": string | null,
  "time": string | null,
  "category": string,
  "paymentMethod": string,
  "summary": string,
  "confidence": number
}`;

// We will test receipt_sample_hangang.jpg with Flash-Lite and check if it handles multiple numbers accurately
async function testDifficultCases() {
  console.log('=== Testing Difficult Cases with Gemini 3.1 Flash-Lite ===\n');

  const samplePath = 'public/images/receipt_sample_hangang.jpg';
  const fileBuffer = fs.readFileSync(path.resolve(samplePath));
  const base64Data = fileBuffer.toString('base64');

  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-lite',
    contents: [
      {
        inlineData: {
          mimeType: 'image/jpeg',
          data: base64Data,
        },
      },
      prompt,
    ],
    config: {
      temperature: 0.1,
      responseMimeType: 'application/json',
    },
  });

  const parsed = JSON.parse(response.text?.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim() || '{}');
  console.log('Result for receipt_sample_hangang.jpg:');
  console.log(JSON.stringify(parsed, null, 2));
}

testDifficultCases();
