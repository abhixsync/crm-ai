import { CustomerStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseCustomerExcel } from "@/lib/server/excel";
import { getTenantContext, requireSession, hasRole } from "@/lib/server/auth-guard";
import { enqueueCustomerIfEligible } from "@/lib/journey/enqueue-service";
import { databaseUnavailableResponse, isDatabaseUnavailable } from "@/lib/server/database-error";
import { getPlanGuard, isPlanLimitError, planLimitResponse } from "@/lib/subscription/plan-guard";

const UPSERT_BATCH_SIZE = 50;
const ENQUEUE_BATCH_SIZE = 50;

function parseBoolean(value, fallback = false) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  if (!normalized) {
    return fallback;
  }

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function chunkArray(items, size) {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function toCustomerWriteData(row) {
  return {
    firstName: row.firstName,
    lastName: row.lastName,
    phone: row.phone,
    email: row.email,
    city: row.city,
    state: row.state,
    source: row.source,
    loanType: row.loanType,
    loanAmount: row.loanAmount,
    monthlyIncome: row.monthlyIncome,
    notes: row.notes,
  };
}

async function enqueueCustomersInBackground(customerIds) {
  for (const batch of chunkArray(customerIds, ENQUEUE_BATCH_SIZE)) {
    await Promise.allSettled(
      batch.map((customerId) => enqueueCustomerIfEligible(customerId, "excel_upload"))
    );
  }
}

export async function POST(request) {
  const auth = await requireSession();

  if (auth.error) return auth.error;

  if (!hasRole(auth.session, ["ADMIN", "SALES"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await request.formData();
  const tenant = getTenantContext(auth.session);
  const tenantId = tenant.tenantId;
  const canRequestEnqueue = hasRole(auth.session, ["ADMIN"]);

  if (!tenantId) {
    return Response.json({ error: "Tenant context required." }, { status: 400 });
  }

  try {
    const guard = await getPlanGuard(tenantId);
    guard.assertCanUploadLeads();
  } catch (err) {
    if (isPlanLimitError(err)) return planLimitResponse(err);
    throw err;
  }

  const file = formData.get("file");
  const enqueueRequested = canRequestEnqueue && parseBoolean(formData.get("enqueue"), false);

  if (!file) {
    return Response.json({ error: "File is required" }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const rows = parseCustomerExcel(Buffer.from(bytes));

  let successRows = 0;
  let failedRows = 0;
  const validRows = [];
  const upsertedCustomerIds = [];

  for (const row of rows) {
    if (!row.firstName || !row.phone) {
      failedRows += 1;
      continue;
    }

    validRows.push(row);
  }

  for (const batch of chunkArray(validRows, UPSERT_BATCH_SIZE)) {
    const upsertResults = await Promise.allSettled(
      batch.map((row) =>
        prisma.customer.upsert({
          where: {
            tenantId_phone: {
              tenantId,
              phone: row.phone,
            },
          },
          update: toCustomerWriteData(row),
          create: {
            tenantId,
            ...toCustomerWriteData(row),
            status: CustomerStatus.NEW,
          },
          select: {
            id: true,
          },
        })
      )
    );

    for (const result of upsertResults) {
      if (result.status === "fulfilled") {
        successRows += 1;
        upsertedCustomerIds.push(result.value.id);
        continue;
      }

      if (isDatabaseUnavailable(result.reason)) {
        console.warn("[api/leads/upload] Database unavailable during row upsert.");
        return databaseUnavailableResponse();
      }

      failedRows += 1;
    }
  }

  if (enqueueRequested && upsertedCustomerIds.length > 0) {
    queueMicrotask(() => {
      void enqueueCustomersInBackground(upsertedCustomerIds);
    });
  }

  try {
    await prisma.leadUpload.create({
      data: {
        tenantId,
        fileName: file.name,
        totalRows: rows.length,
        successRows,
        failedRows,
        uploadedById: auth.session.user.id,
      },
    });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      console.warn("[api/leads/upload] Database unavailable while recording upload summary.");
      return databaseUnavailableResponse();
    }

    throw error;
  }

  return Response.json({
    message: "Lead upload processed",
    totalRows: rows.length,
    successRows,
    failedRows,
    enqueue: {
      requested: enqueueRequested,
      mode: enqueueRequested ? "background" : "skipped",
      candidates: upsertedCustomerIds.length,
    },
  });
}
