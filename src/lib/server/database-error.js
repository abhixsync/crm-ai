export function isDatabaseUnavailable(error) {
  const code = error?.code;
  const message = String(error?.message || "");

  return code === "P1001" || message.includes("Can't reach database server");
}

export function databaseUnavailableResponse(extra = {}) {
  return Response.json(
    {
      degraded: true,
      error: "Database unavailable",
      ...extra,
    },
    { status: 503 }
  );
}