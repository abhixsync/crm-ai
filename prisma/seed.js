const bcrypt = require("bcryptjs");
const { PrismaClient, UserRole, AiProviderType, TelephonyProviderType } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  // Create base tenant for super admin
  const baseTenantName = "Super Admin";
  const baseTenantSlug = "super-admin";
  let baseTenant = await prisma.tenant.findUnique({ where: { slug: baseTenantSlug } });

  if (!baseTenant) {
    baseTenant = await prisma.tenant.create({
      data: {
        name: baseTenantName,
        slug: baseTenantSlug,
        isActive: true,
      },
    });
  }

  const superAdminEmail = "lucifer.shukla@crm.local";
  const existingSuperAdmin = await prisma.user.findUnique({ where: { email: superAdminEmail } });

  if (!existingSuperAdmin) {
    const superAdminHash = await bcrypt.hash("123456", 10);

    await prisma.user.create({
      data: {
        name: "lucifer.shukla",
        email: superAdminEmail,
        passwordHash: superAdminHash,
        role: UserRole.SUPER_ADMIN,
        tenantId: baseTenant.id, // Assign super admin to base tenant
      },
    });
  }

  const email = "admin@crm.local";
  const existing = await prisma.user.findUnique({ where: { email } });

  if (!existing) {
    // Create a default tenant for the admin user
    const defaultTenantName = "Demo CRM";
    const defaultTenantSlug = "demo-crm";
    let defaultTenant = await prisma.tenant.findUnique({ where: { slug: defaultTenantSlug } });

    if (!defaultTenant) {
      defaultTenant = await prisma.tenant.create({
        data: {
          name: defaultTenantName,
          slug: defaultTenantSlug,
          isActive: true,
        },
      });
    }

    const passwordHash = await bcrypt.hash("Admin@123", 10);

    await prisma.user.create({
      data: {
        name: "CRM Admin",
        email,
        passwordHash,
        role: UserRole.ADMIN,
        tenantId: defaultTenant.id, // Assign admin to default tenant
      },
    });
  }

  const providerName = "OpenAI Default";
  const existingProvider = await prisma.aiProviderConfig.findUnique({
    where: { name: providerName },
  });

  if (!existingProvider) {
    await prisma.aiProviderConfig.create({
      data: {
        name: providerName,
        type: AiProviderType.OPENAI,
        model: "gpt-4.1-mini",
        apiKey: process.env.OPENAI_API_KEY || null,
        priority: 1,
        enabled: true,
        isActive: true,
      },
    });
  }

  const telephonyProviderName = "Twilio Default";
  const existingTelephonyProvider = await prisma.telephonyProviderConfig.findUnique({
    where: { name: telephonyProviderName },
  });

  if (!existingTelephonyProvider) {
    await prisma.telephonyProviderConfig.create({
      data: {
        name: telephonyProviderName,
        type: TelephonyProviderType.TWILIO,
        priority: 1,
        enabled: true,
        isActive: true,
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });