"use server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function getTransactions() {
  try {
    const transactions = await prisma.transaction.findMany({
      orderBy: { createdAt: "desc" },
      take: 15,
    });
    return transactions;
  } catch (error) {
    console.error("Error fetching transactions:", error);
    return [];
  }
}

export async function getBalances() {
  try {
    const transactions = await prisma.transaction.findMany();
    
    let usdBalance = 0;
    let zwgBalance = 0;

    for (const t of transactions) {
      const modifier = t.type === "INCOME" ? 1 : t.type === "EXPENSE" ? -1 : 0;
      
      if (t.type === "TRANSFER") {
        // Transferring from one currency to another using the street rate recorded at the time
        const rate = t.streetRate || 25.0;
        if (t.currency === "USD") {
          // Transferring USD -> ZWG
          usdBalance -= t.amount;
          zwgBalance += t.amount * rate;
        } else if (t.currency === "ZWG") {
          // Transferring ZWG -> USD
          zwgBalance -= t.amount;
          usdBalance += t.amount / rate;
        }
      } else {
        if (t.currency === "USD") usdBalance += t.amount * modifier;
        if (t.currency === "ZWG") zwgBalance += t.amount * modifier;
      }
    }

    return { usdBalance, zwgBalance };
  } catch (error) {
    console.error("Error fetching balances:", error);
    return { usdBalance: 0, zwgBalance: 0 };
  }
}

export async function getUserSettings() {
  try {
    let settings = await prisma.userSettings.findUnique({ where: { id: "default_user" } });
    if (!settings) {
      settings = await prisma.userSettings.create({ data: { id: "default_user", streetRateZWG: 25.0 } });
    }
    return settings;
  } catch (error) {
    console.error("Error fetching settings:", error);
    return { streetRateZWG: 25.0 };
  }
}

export async function updateStreetRate(rate: number) {
  try {
    const settings = await prisma.userSettings.upsert({
      where: { id: "default_user" },
      update: { streetRateZWG: rate },
      create: { id: "default_user", streetRateZWG: rate }
    });
    return settings.streetRateZWG;
  } catch (error) {
    console.error("Error updating street rate:", error);
    throw error;
  }
}

export async function updateTransaction(id: string, data: {
  amount?: number;
  currency?: string;
  method?: string;
  context?: string;
  type?: string;
  description?: string;
}) {
  try {
    const updated = await prisma.transaction.update({
      where: { id },
      data
    });
    return updated;
  } catch (error) {
    console.error("Error updating transaction:", error);
    throw error;
  }
}

export async function createTransfer(data: {
  amount: number;
  currency: string;
  method: string;
  description: string;
  streetRate: number;
}) {
  try {
    const created = await prisma.transaction.create({
      data: {
        type: "TRANSFER",
        context: "PERSONAL",
        amount: data.amount,
        currency: data.currency,
        method: data.method,
        description: data.description,
        streetRate: data.streetRate
      }
    });
    return created;
  } catch (error) {
    console.error("Error creating transfer:", error);
    throw error;
  }
}

export async function deleteTransaction(id: string) {
  try {
    await prisma.transaction.delete({
      where: { id }
    });
    return true;
  } catch (error) {
    console.error("Error deleting transaction:", error);
    throw error;
  }
}
