import { prisma } from '@/lib/prisma.js';

/**
 * GET /api/tenant/super-admin-tenant
 * Fetch the super admin tenant (typically the primary tenant for super admins)
 * For super admins with no assigned tenant, returns the first tenant or creates one
 */
export async function GET(request) {
  try {
    // Try to find a tenant with slug "super-admin" first
    let tenant = await prisma.tenant.findFirst({
      where: {
        slug: 'super-admin',
      },
      select: {
        id: true,
        name: true,
        slug: true,
        loanAssistantCompanyName: true,
        loanAssistantCallbackPhone: true,
        aiAgentName: true,
      },
    });

    // If no "super-admin" tenant found, get the first active tenant
    if (!tenant) {
      tenant = await prisma.tenant.findFirst({
        where: {
          isActive: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
        select: {
          id: true,
          name: true,
          slug: true,
          loanAssistantCompanyName: true,
          loanAssistantCallbackPhone: true,
          aiAgentName: true,
        },
      });
    }

    if (!tenant) {
      return Response.json(
        { 
          error: 'No super admin tenant found. Please create a tenant first.',
          success: false
        },
        { status: 404 }
      );
    }

    return Response.json({
      success: true,
      data: tenant,
    });
  } catch (error) {
    console.error('Error fetching super admin tenant:', error);
    return Response.json(
      { error: 'Failed to fetch super admin tenant', success: false },
      { status: 500 }
    );
  }
}
