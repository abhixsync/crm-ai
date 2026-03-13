"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export function LoanAssistantCallsIntegrator({ customers = [] }) {
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [isLaunching, setIsLaunching] = useState(false);

  const handleLaunchCall = async (customer) => {
    setIsLaunching(true);
    setSelectedCustomer(customer);

    // In production, would initiate actual call via Twilio/Vonage
    setTimeout(() => {
      alert(`Launch call feature for ${customer.firstName} ${customer.lastName} - Coming soon!`);
      setIsLaunching(false);
    }, 1000);
  };

  return (
    <Card className="border-blue-200 bg-blue-50">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <span>🤖 AI Loan Assistant</span>
              <span className="inline-flex rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-700">Beta</span>
            </CardTitle>
            <CardDescription>
              Launch AI-powered loan calling campaigns for qualified customers
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-blue-200 bg-white p-4">
          <div className="mb-4 text-sm text-slate-600">
            <p className="font-semibold">📞 Quick Action:</p>
            <p>Select a customer to launch or view previous AI call interactions.</p>
          </div>

          {customers.length > 0 ? (
            <div className="space-y-2">
              {customers.slice(0, 5).map((customer) => (
                <div key={customer.id} className="flex items-center justify-between rounded border border-slate-200 p-3">
                  <div>
                    <div className="font-medium text-slate-900">
                      {customer.firstName} {customer.lastName}
                    </div>
                    <div className="text-sm text-slate-600">{customer.phone}</div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleLaunchCall(customer)}
                    disabled={isLaunching}
                  >
                    {isLaunching && selectedCustomer?.id === customer.id
                      ? "Launching..."
                      : "Launch Call"}
                  </Button>
                </div>
              ))}

              <div className="flex gap-2 pt-2">
                <Link href="/loan-assistant-demo" className="flex-1">
                  <Button variant="outline" className="w-full">
                    Test Demo
                  </Button>
                </Link>
                <Button variant="outline" className="flex-1" disabled>
                  Campaign Mode (Soon)
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-4 text-center text-slate-600">
              <p>No customers available</p>
              <p className="text-xs">Add customers to your CRM to start campaigns</p>
            </div>
          )}
        </div>

        <div className="text-xs text-slate-600">
          💡 Tip: The AI assistant speaks natural Hinglish and qualifies leads automatically.
        </div>
      </CardContent>
    </Card>
  );
}
