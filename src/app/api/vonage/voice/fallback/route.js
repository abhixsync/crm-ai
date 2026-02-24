export async function POST() {
  return Response.json(
    [
      {
        action: "talk",
        text: "Sorry, we are experiencing issues.",
      },
    ],
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
}

export async function GET() {
  return POST();
}
