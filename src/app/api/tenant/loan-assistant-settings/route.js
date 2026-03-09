import { prisma } from '@/lib/prisma.js';

/**
 * GET /api/tenant/loan-assistant-settings
 * Fetch loan assistant settings for the current tenant
 * 
 * Headers:
 *   X-Tenant-ID: string (tenant ID)
 */
export async function GET(request) {
  try {
    const tenantId = request.headers.get('X-Tenant-ID');

    if (!tenantId) {
      return Response.json(
        { error: 'X-Tenant-ID header is required', success: false },
        { status: 400 }
      );
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        loanAssistantCompanyName: true,
        loanAssistantCallbackPhone: true,
        aiAgentName: true,
      },
    });

    if (!tenant) {
      return Response.json(
        { error: 'Tenant not found', success: false },
        { status: 404 }
      );
    }

    return Response.json({
      success: true,
      data: {
        tenantId: tenant.id,
        tenantName: tenant.name,
        loanAssistantCompanyName: tenant.loanAssistantCompanyName,
        loanAssistantCallbackPhone: tenant.loanAssistantCallbackPhone,
        aiAgentName: tenant.aiAgentName,
        // Resolved company name - use loanAssistantCompanyName, fallback to tenantName
        resolvedCompanyName: tenant.loanAssistantCompanyName || tenant.name,
      },
    });
  } catch (error) {
    console.error('Error fetching loan assistant settings:', error);
    return Response.json(
      { error: 'Failed to fetch settings', success: false },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/tenant/loan-assistant-settings
 * Update loan assistant settings for the current tenant
 * 
 * Headers:
 *   X-Tenant-ID: string (tenant ID)
 * 
 * Body:
 *   {
 *     loanAssistantCompanyName?: string
 *     loanAssistantCallbackPhone?: string
 *     aiAgentName?: string
 *   }
 */
export async function PUT(request) {
  try {
    const tenantId = request.headers.get('X-Tenant-ID');

    if (!tenantId) {
      return Response.json(
        { error: 'X-Tenant-ID header is required', success: false },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { loanAssistantCompanyName, loanAssistantCallbackPhone, aiAgentName } = body;

    // Validate tenant exists
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      return Response.json(
        { error: 'Tenant not found', success: false },
        { status: 404 }
      );
    }

    // Build update payload
    const updateData = {};
    if (loanAssistantCompanyName !== undefined) {
      updateData.loanAssistantCompanyName = loanAssistantCompanyName || null;
    }
    if (loanAssistantCallbackPhone !== undefined) {
      updateData.loanAssistantCallbackPhone = loanAssistantCallbackPhone || null;
    }
    if (aiAgentName !== undefined) {
      updateData.aiAgentName = aiAgentName;
    }

    const updatedTenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: updateData,
      select: {
        id: true,
        name: true,
        loanAssistantCompanyName: true,
        loanAssistantCallbackPhone: true,
        aiAgentName: true,
      },
    });

    return Response.json({
      success: true,
      data: {
        tenantId: updatedTenant.id,
        tenantName: updatedTenant.name,
        loanAssistantCompanyName: updatedTenant.loanAssistantCompanyName,
        loanAssistantCallbackPhone: updatedTenant.loanAssistantCallbackPhone,
        aiAgentName: updatedTenant.aiAgentName,
        resolvedCompanyName: updatedTenant.loanAssistantCompanyName || updatedTenant.name,
      },
    });
  } catch (error) {
    console.error('Error updating loan assistant settings:', error);
    return Response.json(
      { error: 'Failed to update settings', success: false },
      { status: 500 }
    );
  }
}
