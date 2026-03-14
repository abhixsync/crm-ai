"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoanAssistantDemo() {
  const [sessionId, setSessionId] = useState(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [conversation, setConversation] = useState([]);
  const [customerMessage, setCustomerMessage] = useState("");
  const [error, setError] = useState(null);

  // Test API connectivity
  const testAPIConnectivity = async () => {
    console.log('🧪 Testing API connectivity...');
    console.log('Current profile state:', profile);
    try {
      const testPayload = {
        test: "payload",
        customer_profile: profile,
      };
      
      console.log('Test payload:', testPayload);
      console.log('Test payload JSON:', JSON.stringify(testPayload));
      
      const response = await fetch("/api/debug-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testPayload),
      });
      
      console.log('Test response status:', response.status);
      const data = await response.json();
      console.log('✅ API Test Response:', data);
      setError(`✅ Test received: ${JSON.stringify(data.keys)}`);
    } catch (err) {
      console.error('❌ API Test Failed:', err);
      setError(`❌ Test failed: ${err.message}`);
    }
  };

  // Customer profile form state
  const [profile, setProfile] = useState({
    name: "Abhishek Shukla",
    city: "Meerut",
    monthly_income: 500000,
    employment_type: "salaried",
    credit_score: 720,
    existing_loans: "none",
    loan_interest_type: "personal_loan",
  });

  const handleProfileChange = (field, value) => {
    setProfile((prev) => ({
      ...prev,
      [field]: field === "monthly_income" || field === "credit_score" ? parseInt(value) : value,
    }));
  };

  const initializeCall = async () => {
    setIsInitializing(true);
    setError(null);

    try {
      // Build and validate payload
      console.group('🚀 Initialize Call');
      console.log('Profile state:', profile);
      
      const payload = {
        action: "init",
        customer_profile: profile,
      };

      console.log('Payload object:', payload);
      console.log('Payload.customer_profile:', payload.customer_profile);
      console.log('customer_profile keys:', Object.keys(payload.customer_profile));
      
      const jsonBody = JSON.stringify(payload);
      console.log('JSON stringified length:', jsonBody.length);
      console.log('JSON stringified:', jsonBody);
      console.log('Payload.customer_profile before send:', payload.customer_profile);
      console.log('===== FINAL PAYLOAD TO SEND =====');
      console.log(jsonBody);
      console.log('===================================');
      console.groupEnd();

      console.log('About to fetch to /api/loan-assistant/conversation');

      const response = await fetch("/api/loan-assistant/conversation", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
        },
        body: jsonBody,
      });

      console.log('Response status:', response.status);
      console.log('Response ok:', response.ok);

      const data = await response.json();

      console.group('📩 API Response');
      console.log('Response data:', data);
      console.log('Response success:', data.success);
      console.log('Response error:', data.error);
      console.groupEnd();

      if (!response.ok || !data.success) {
        console.error("❌ Full error response:", data);
        const errorMsg = data.error || data.message || `Failed: ${response.status}`;
        setError(errorMsg);
        return;
      }

      setSessionId(data.session_id);
      console.log('✅✅✅ SUCCESS! Session created:', data.session_id);
      console.log('✅ AI Response:', data.ai_response);
      
      setConversation([
        {
          role: "system",
          message: `[Call started with ${profile.name} from ${profile.city}]`,
          timestamp: new Date(),
        },
        {
          role: "ai",
          message: data.ai_response.ai_message,
          intent: data.ai_response.intent,
          stage: data.ai_response.conversation_stage,
          timestamp: new Date(),
        },
      ]);
      
      console.log('✅ Conversation state updated');
      setError(null); // Clear any error
    } catch (err) {
      console.error("🔥 Exception in initializeCall:", err);
      console.error("Stack:", err.stack);
      setError(err.message || "Network error occurred");
    } finally {
      setIsInitializing(false);
    }
  };

  const sendMessage = async () => {
    if (!customerMessage.trim() || !sessionId) return;

    setIsLoading(true);
    setError(null);

    const userMsg = customerMessage;
    setCustomerMessage("");

    try {
      setConversation((prev) => [
        ...prev,
        {
          role: "customer",
          message: userMsg,
          timestamp: new Date(),
        },
      ]);

      const response = await fetch("/api/loan-assistant/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "next",
          session_id: sessionId,
          customer_message: userMsg,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        console.error("API Error Response:", data);
        setError(data.error || data.message || `Failed: ${response.status}`);
        return;
      }

      const aiMsg = {
        role: "ai",
        message: data.ai_response.ai_message,
        intent: data.ai_response.intent,
        confidence: data.ai_response.confidence,
        stage: data.ai_response.conversation_stage,
        extractedData: data.ai_response.extracted_data,
        timestamp: new Date(),
      };

      setConversation((prev) => [...prev, aiMsg]);

      // If session ended, show summary
      if (!data.is_session_active && data.call_summary) {
        if (data.notification) {
          console.log('Advisor notification result:', data.notification);
        }
        setConversation((prev) => [
          ...prev,
          {
            role: "system",
            message: `[Call ended - Intent: ${data.call_summary.intent}]`,
            timestamp: new Date(),
            callSummary: data.call_summary,
          },
        ]);
        setSessionId(null);
      }
    } catch (err) {
      console.error("Error in sendMessage:", err);
      setError(err.message || "Network error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="grid gap-6 md:grid-cols-3">
      {/* Customer Profile Card */}
      <Card className="md:col-span-1">
        <CardHeader>
          <CardTitle>Customer Profile</CardTitle>
          <CardDescription>Set customer details for the call</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium text-slate-700">Name</label>
            <Input
              id="name"
              value={profile.name}
              onChange={(e) => handleProfileChange("name", e.target.value)}
              disabled={!!sessionId}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="city" className="text-sm font-medium text-slate-700">City</label>
            <Input
              id="city"
              value={profile.city}
              onChange={(e) => handleProfileChange("city", e.target.value)}
              disabled={!!sessionId}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="income" className="text-sm font-medium text-slate-700">Monthly Income (₹)</label>
            <Input
              id="income"
              type="number"
              value={profile.monthly_income}
              onChange={(e) => handleProfileChange("monthly_income", e.target.value)}
              disabled={!!sessionId}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="employment" className="text-sm font-medium text-slate-700">Employment Type</label>
            <select
              id="employment"
              value={profile.employment_type}
              onChange={(e) => handleProfileChange("employment_type", e.target.value)}
              disabled={!!sessionId}
              className="h-9 w-full rounded-md border px-3 text-sm outline-none"
              style={{ borderColor: "var(--input)", backgroundColor: "var(--card)", color: "var(--foreground)" }}
            >
              <option value="salaried">Salaried</option>
              <option value="business">Business</option>
              <option value="self-employed">Self-Employed</option>
              <option value="freelancer">Freelancer</option>
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="credit" className="text-sm font-medium text-slate-700">Credit Score</label>
            <Input
              id="credit"
              type="number"
              value={profile.credit_score}
              onChange={(e) => handleProfileChange("credit_score", e.target.value)}
              disabled={!!sessionId}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="loans" className="text-sm font-medium text-slate-700">Existing Loans</label>
            <select value={profile.existing_loans} onChange={(e) => handleProfileChange("existing_loans", e.target.value)} disabled={!!sessionId} className="h-9 w-full rounded-md border px-3 text-sm outline-none" style={{ borderColor: "var(--input)", backgroundColor: "var(--card)", color: "var(--foreground)" }}>
              <option value="none">None</option>
              <option value="1_personal">1 Personal Loan</option>
              <option value="home_loan">Home Loan</option>
              <option value="multiple">Multiple Loans</option>
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="interest" className="text-sm font-medium text-slate-700">Interested Loan Type</label>
            <select
              id="interest"
              value={profile.loan_interest_type}
              onChange={(e) => handleProfileChange("loan_interest_type", e.target.value)}
              disabled={!!sessionId}
              className="h-9 w-full rounded-md border px-3 text-sm outline-none"
              style={{ borderColor: "var(--input)", backgroundColor: "var(--card)", color: "var(--foreground)" }}
            >
              <option value="personal_loan">Personal Loan</option>
              <option value="home_loan">Home Loan</option>
              <option value="business_loan">Business Loan</option>
              <option value="auto_loan">Auto Loan</option>
            </select>
          </div>

          <Button
            onClick={initializeCall}
            disabled={!!sessionId || isInitializing}
            className="w-full"
          >
            {isInitializing ? "Starting..." : "Start Call"}
          </Button>

          <Button
            onClick={testAPIConnectivity}
            variant="outline"
            className="w-full text-xs"
          >
            🧪 Test API
          </Button>

          {error && (
            <div className="rounded border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800 max-h-40 overflow-y-auto font-mono">
              <strong>Debug:</strong>
              <br />
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Conversation Card */}
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>
            {sessionId ? "Call in Progress" : "No Active Call"}
          </CardTitle>
          <CardDescription>
            {sessionId ? `Session: ${sessionId.slice(0, 20)}...` : "Initialize a call to start"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Conversation Display */}
          <div className="flex h-96 flex-col gap-3 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-4">
            {conversation.length === 0 ? (
              <div className="flex items-center justify-center text-slate-500">
                Start a call to see conversation here
              </div>
            ) : (
              conversation.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex gap-3 ${
                    msg.role === "customer" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-xs rounded-lg px-3 py-2 text-sm ${
                      msg.role === "ai"
                        ? "bg-blue-100 text-blue-900"
                        : msg.role === "customer"
                          ? "bg-green-100 text-green-900"
                          : "bg-slate-200 text-slate-700 italic"
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{msg.message}</div>
                    {msg.intent && (
                      <div className="mt-1 text-xs opacity-75">
                        Intent: <strong>{msg.intent}</strong>
                        {msg.confidence && ` (${(msg.confidence * 100).toFixed(0)}%)`}
                      </div>
                    )}
                    {msg.extractedData && (
                      <div className="mt-2 space-y-1 border-t border-blue-200 pt-2 text-xs opacity-75">
                        {msg.extractedData.loanType && (
                          <div>Loan: {msg.extractedData.loanType}</div>
                        )}
                        {msg.extractedData.amount && (
                          <div>Amount: ₹{msg.extractedData.amount.toLocaleString()}</div>
                        )}
                        {msg.extractedData.timeline && (
                          <div>Timeline: {msg.extractedData.timeline}</div>
                        )}
                      </div>
                    )}
                    {msg.callSummary && (
                      <div className="mt-2 space-y-1 border-t border-slate-300 pt-2 text-xs font-semibold">
                        <div>CALL SUMMARY</div>
                        <div>Duration: {msg.callSummary.call_duration_seconds}s</div>
                        <div>Turns: {msg.callSummary.turn_count}</div>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Message Input */}
          {sessionId && (
            <div className="flex gap-2">
              <Input
                placeholder="Type customer response..."
                value={customerMessage}
                onChange={(e) => setCustomerMessage(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === "Enter" && !isLoading) {
                    sendMessage();
                  }
                }}
                disabled={isLoading}
              />
              <Button onClick={sendMessage} disabled={!customerMessage.trim() || isLoading}>
                {isLoading ? "..." : "Send"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
