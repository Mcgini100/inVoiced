import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { PrismaClient } from "@prisma/client";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio") as Blob | null;

    if (!audioFile) {
      return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await audioFile.arrayBuffer());
    const file = new File([buffer], "audio.webm", { type: audioFile.type });

    // 1. Transcription using Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: file,
      model: "whisper-1",
      language: "en",
    });
    const transcript = transcription.text;

    // Fetch the last transaction to act as memory/context for corrections
    const lastTx = await prisma.transaction.findFirst({
      orderBy: { createdAt: "desc" }
    });

    let contextPrompt = "";
    if (lastTx) {
      contextPrompt = `\nActive Context - Last Transaction logged is: ${JSON.stringify({
        type: lastTx.type,
        context: lastTx.context,
        amount: lastTx.amount,
        currency: lastTx.currency,
        method: lastTx.method,
        description: lastTx.description
      })}`;
    }

    // 2. Structured Data Extraction
    const systemPrompt = `You are a financial tracker for Zimbabwe. Extract transaction data from voice transcripts (often containing "Shinglish" or local slang).
Rules:
- "bonds", "RTGS", "ZiG", "Zim dollars" = "ZWG"
- "US", "bucks", "USD", "dollars" (if context implies foreign) = "USD"
- Payment methods: "EcoCash", "Innsbucks", "Bank/Swipe" = "BANK", else "CASH"
- If it's a sale, gig, or business expense -> "BUSINESS". If personal groceries, transport -> "PERSONAL".
- type: "INCOME" (money received), "EXPENSE" (money spent), "TRANSFER" (moving USD to ZiG account or vice versa).

IMPORTANT: Check if the user is trying to CORRECT, CHANGE, or AMEND the last transaction (e.g. "change that last one to USD", "make the groceries amount 15 instead", "correct the last transaction currency to USD").
If they are correcting: set "isCorrection" to true and populate "updates" with ONLY the changed fields.
Otherwise, set "isCorrection" to false and populate "newTransaction".

Output ONLY valid JSON matching this schema:
{
  "isCorrection": boolean,
  "updates": {
    "type": "INCOME" | "EXPENSE" | "TRANSFER" (optional),
    "context": "BUSINESS" | "PERSONAL" (optional),
    "amount": number (optional),
    "currency": "USD" | "ZWG" (optional),
    "method": "CASH" | "ECOCASH" | "INNSBUCKS" | "BANK" (optional),
    "description": string (optional)
  },
  "newTransaction": {
    "type": "INCOME" | "EXPENSE" | "TRANSFER",
    "context": "BUSINESS" | "PERSONAL",
    "amount": number,
    "currency": "USD" | "ZWG",
    "method": "CASH" | "ECOCASH" | "INNSBUCKS" | "BANK",
    "description": string
  }
} ${contextPrompt}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Transcript: "${transcript}"` }
      ],
      response_format: { type: "json_object" },
    });

    const structuredDataString = completion.choices[0].message.content;
    if (!structuredDataString) throw new Error("Failed to generate structured data");
    
    const structuredData = JSON.parse(structuredDataString);

    let resultTransaction;

    if (structuredData.isCorrection && lastTx) {
      // Apply updates to the last transaction
      resultTransaction = await prisma.transaction.update({
        where: { id: lastTx.id },
        data: structuredData.updates
      });
    } else {
      // Create new transaction
      const txData = structuredData.newTransaction;
      let settings = await prisma.userSettings.findUnique({ where: { id: "default_user" } });
      if (!settings) {
        settings = await prisma.userSettings.create({ data: { id: "default_user", streetRateZWG: 25.0 } });
      }

      resultTransaction = await prisma.transaction.create({
        data: {
          type: txData.type,
          context: txData.context,
          amount: txData.amount,
          currency: txData.currency,
          method: txData.method,
          description: txData.description,
          streetRate: settings.streetRateZWG
        }
      });
    }

    return NextResponse.json({
      success: true,
      transcript,
      data: resultTransaction,
      isCorrection: structuredData.isCorrection
    });
  } catch (error: any) {
    console.error("Error processing audio:", error);
    return NextResponse.json(
      { error: "Failed to process audio", details: error.message },
      { status: 500 }
    );
  }
}
