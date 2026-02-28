const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const assets = {
    logoUrl: '/theme/defaults/logo.png',
    faviconUrl: '/theme/defaults/favicon.png',
    loginBackgroundUrl: '/theme/defaults/login-background.png',
    applicationBackgroundUrl: '/theme/defaults/application-background.png',
  };

  const existingBaseTheme = await prisma.tenantTheme.findFirst({
    where: { isBaseTheme: true },
    orderBy: { updatedAt: 'desc' },
  });

  if (existingBaseTheme) {
    await prisma.tenantTheme.update({
      where: { id: existingBaseTheme.id },
      data: {
        ...assets,
        isActive: true,
        themeName: existingBaseTheme.themeName || 'Platform Default Theme',
      },
    });
  } else {
    await prisma.tenantTheme.create({
      data: {
        tenantId: null,
        isBaseTheme: true,
        isActive: true,
        themeName: 'Platform Default Theme',
        ...assets,
      },
    });
  }

  const tenantAssetReset = await prisma.tenantTheme.updateMany({
    where: { isBaseTheme: false },
    data: {
      logoUrl: null,
      faviconUrl: null,
      loginBackgroundUrl: null,
      applicationBackgroundUrl: null,
    },
  });

  console.log('✅ Default assets applied to base theme');
  console.log(`✅ Tenant-level asset overrides cleared for ${tenantAssetReset.count} theme record(s)`);
  console.log('Assets:');
  Object.entries(assets).forEach(([key, value]) => console.log(`- ${key}: ${value}`));
}

main()
  .catch((error) => {
    console.error('❌ Failed to apply default theme assets:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
