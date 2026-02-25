import { CustomerStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseCustomerExcel } from "@/lib/server/excel";
import { requireSession, hasRole } from "@/lib/server/auth-guard";
import { enqueueCustomerIfEligible } from "@/lib/journey/enqueue-service";
import { databaseUnavailableResponse, isDatabaseUnavailable } from "@/lib/server/database-error";

export async function POST(request) {
  const auth = await requireSession();

  if (auth.error) return auth.error;

  if (!hasRole(auth.session, ["ADMIN", "SALES"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!file) {
    return Response.json({ error: "File is required" }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const rows = parseCustomerExcel(Buffer.from(bytes));

  let successRows = 0;
  let failedRows = 0;

  for (const row of rows) {
    if (!row.firstName || !row.phone) {
      failedRows += 1;
      continue;
    }

    try {
      const customer = await prisma.customer.upsert({
        where: { phone: row.phone },
        create: {
          ...row,
          status: CustomerStatus.NEW,
        },
        update: {
          firstName: row.firstName,
          lastName: row.lastName,
          email: row.email,
          city: row.city,
          state: row.state,
          source: row.source,
          loanType: row.loanType,
          loanAmount: row.loanAmount,
          monthlyIncome: row.monthlyIncome,
          notes: row.notes,
        },
      });

      try {
        await enqueueCustomerIfEligible(customer.id, "excel_upload");
      } catch {
      }

      successRows += 1;
    } catch (error) {
      if (isDatabaseUnavailable(error)) {
        console.warn("[api/leads/upload] Database unavailable during row upsert.");
        return databaseUnavailableResponse();
      }

      failedRows += 1;
    }
  }

  try {
    await prisma.leadUpload.create({
      data: {
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
  });
}