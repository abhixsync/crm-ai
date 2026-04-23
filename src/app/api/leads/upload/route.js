import { CustomerStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseCustomerExcel } from "@/lib/server/excel";
import { getTenantContext, requireSession, hasRole } from "@/lib/server/auth-guard";
import { enqueueCustomerIfEligible } from "@/lib/journey/enqueue-service";
import { databaseUnavailableResponse, isDatabaseUnavailable } from "@/lib/server/database-error";
import { getPlanGuard, isPlanLimitError, planLimitResponse } from "@/lib/subscription/plan-guard";
import { createNotification } from "@/lib/notifications/notification-service";
import { invalidateCache } from "@/lib/cache/api-cache";
import { publishEvent } from "@/lib/events/event-publisher";

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
  const tenant = getTenantContext(auth.session, request);
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

  const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
  if (file.size > MAX_FILE_BYTES) {
    return Response.json({ error: "File too large. Maximum upload size is 5 MB." }, { status: 400 });
  }

  let rows;
  try {
    const bytes = await file.arrayBuffer();
    rows = parseCustomerExcel(Buffer.from(bytes));
  } catch {
    return Response.json({ error: "Invalid file format. Please upload a valid Excel (.xlsx) or CSV file." }, { status: 400 });
  }

  const MAX_ROWS = 5000;
  if (rows.length > MAX_ROWS) {
    return Response.json({ error: `File contains too many rows (${rows.length}). Maximum allowed is ${MAX_ROWS}.` }, { status: 400 });
  }

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

  // In-app notification (non-blocking)
  createNotification(tenantId, {
    userId: auth.session.user.id,
    type: "UPLOAD_COMPLETE",
    title: "Lead upload complete",
    body: `${successRows} of ${rows.length} rows imported from "${file.name}".`,
    link: "/admin/lead-uploads",
  }).catch(() => {});

  invalidateCache(`metrics:${tenantId}:0`, `metrics:${tenantId}:1`).catch(() => {});
  publishEvent(tenantId, { type: "metrics:update" }).catch(() => {});

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
