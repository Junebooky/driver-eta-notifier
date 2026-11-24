import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('No GEMINI_API_KEY');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });

// Target models to compare
const models = [
  { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash-Lite', inputPerM: 0.25, outputPerM: 1.50 },
  { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash-Lite', inputPerM: 0.30, outputPerM: 2.50 },
  { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash (Current)', inputPerM: 0.75, outputPerM: 3.75 },
];

const samplePaths = [
  'public/images/receipt_sample_fuel.jpg',
  'public/images/receipt_sample_cu.jpg',
];

const prompt = `You are an expert Korean receipt OCR and VIP limousine driver expense classification AI.
Carefully examine this receipt image and extract structured data for a corporate mobility expense report.

Driver context: "윤태준", Vehicle: "116허 1514".

Extract the following fields with high precision:
1. "merchant": Store/Merchant name (상호명, 가맹점명).
2. "address": Store address if printed on the receipt. If not visible, null.
3. "amount": The FINAL total payment amount (합계금액 / 결제금액 / 승인금액 / 청구금액) in KRW as an integer number (no commas, no currency symbols).
4. "date": Transaction date in "YYYY-MM-DD" format.
5. "time": Transaction time in "HH:mm" (24-hour format).
6. "category": Must be STRICTLY one of: "fuel" | "toll" | "parking" | "meal" | "wash" | "maintenance" | "accommodation" | "transit" | "other".
7. "paymentMethod": "company_card" | "driver_personal" | "client_card" | "cash" | "other".
8. "summary": A concise 1-sentence Korean summary of the receipt details.
9. "confidence": Number between 0.0 and 1.0.

Return strictly a single valid JSON object with this exact schema (no markdown fences):
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

async function testModel(modelConfig, imagePath) {
  const fileBuffer = fs.readFileSync(path.resolve(imagePath));
  const base64Data = fileBuffer.toString('base64');
  const mimeType = 'image/jpeg';

  const startTime = Date.now();
  try {
    const response = await ai.models.generateContent({
      model: modelConfig.id,
      contents: [
        {
          inlineData: {
            mimeType,
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
    const elapsedMs = Date.now() - startTime;
    const rawText = response.text?.trim() || '{}';
    const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    const parsed = JSON.parse(cleaned);

    const usage = response.usageMetadata || {};
    const inputTokens = usage.promptTokenCount || 0;
    const outputTokens = usage.candidatesTokenCount || 0;
    const costUsd = (inputTokens / 1_000_000) * modelConfig.inputPerM + (outputTokens / 1_000_000) * modelConfig.outputPerM;
    const costKrw = costUsd * 1380; // approximate KRW/USD exchange rate

    return {
      success: true,
      model: modelConfig.id,
      name: modelConfig.name,
      image: path.basename(imagePath),
      elapsedMs,
      inputTokens,
      outputTokens,
      costUsd,
      costKrw,
      result: parsed,
    };
  } catch (err) {
    const elapsedMs = Date.now() - startTime;
    return {
      success: false,
      model: modelConfig.id,
      name: modelConfig.name,
      image: path.basename(imagePath),
      elapsedMs,
      error: err.message,
    };
  }
}

async function runBenchmark() {
  console.log('=== Starting Gemini Receipt OCR Model Benchmark ===\n');
  const results = [];

  for (const sample of samplePaths) {
    console.log(`Testing Sample: ${sample}`);
    for (const model of models) {
      process.stdout.write(`  Testing ${model.name}... `);
      const res = await testModel(model, sample);
      if (res.success) {
        console.log(`✓ ${res.elapsedMs}ms | Tokens: In=${res.inputTokens}, Out=${res.outputTokens} | Cost: $${res.costUsd.toFixed(6)} (~${res.costKrw.toFixed(2)}원)`);
        console.log(`    Merchant: ${res.result.merchant} | Amount: ${res.result.amount?.toLocaleString()}원 | Date: ${res.result.date} ${res.result.time} | Cat: ${res.result.category} | Addr: ${res.result.address}`);
      } else {
        console.log(`✗ FAILED: ${res.error}`);
      }
      results.push(res);
      await new Promise(r => setTimeout(r, 600));
    }
    console.log('');
  }

  console.log('Benchmark finished.');
}

runBenchmark();
