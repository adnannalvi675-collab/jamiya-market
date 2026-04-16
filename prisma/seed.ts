import { PrismaClient, KycStatus, JameyaStatus, SeatStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...\n');

  // Clean existing data
  await prisma.payment.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.seat.deleteMany();
  await prisma.jameya.deleteMany();
  await prisma.user.deleteMany();

  // ==========================================================================
  // USERS
  // ==========================================================================
  console.log('👤 Creating users...');

  const users = await Promise.all([
    prisma.user.create({
      data: {
        email: 'alice@example.com',
        name: 'Alice Johnson',
        phone: '+1234567001',
        kycStatus: KycStatus.VERIFIED,
        riskScore: 15.0,
        behaviorScore: 85.0,
      },
    }),
    prisma.user.create({
      data: {
        email: 'bob@example.com',
        name: 'Bob Smith',
        phone: '+1234567002',
        kycStatus: KycStatus.VERIFIED,
        riskScore: 30.0,
        behaviorScore: 70.0,
      },
    }),
    prisma.user.create({
      data: {
        email: 'carol@example.com',
        name: 'Carol Williams',
        phone: '+1234567003',
        kycStatus: KycStatus.VERIFIED,
        riskScore: 45.0,
        behaviorScore: 60.0,
      },
    }),
    prisma.user.create({
      data: {
        email: 'dave@example.com',
        name: 'Dave Brown',
        phone: '+1234567004',
        kycStatus: KycStatus.PENDING,
        riskScore: 55.0,
        behaviorScore: 50.0,
      },
    }),
    prisma.user.create({
      data: {
        email: 'eve@example.com',
        name: 'Eve Davis',
        phone: '+1234567005',
        kycStatus: KycStatus.REJECTED,
        riskScore: 80.0,
        behaviorScore: 30.0,
      },
    }),
  ]);

  console.log(`  Created ${users.length} users`);

  // ==========================================================================
  // JAMEYAS
  // ==========================================================================
  console.log('🏦 Creating Jameyas...');

  const jameyaConfigs = [
    {
      name: 'Gold Savings Circle',
      description: 'Premium savings group for verified low-risk members. Monthly $500 contributions with 12-month duration.',
      monthlyContribution: 500,
      duration: 12,
      isFeatured: true,
      conversionRate: 0.85,
      totalViews: 1250,
      totalBookings: 8,
      minRiskScore: 0,
      maxRiskScore: 40,
    },
    {
      name: 'Silver Community Fund',
      description: 'Mid-tier savings group open to moderate-risk members. $300/month for 8 months.',
      monthlyContribution: 300,
      duration: 8,
      isFeatured: false,
      conversionRate: 0.72,
      totalViews: 890,
      totalBookings: 5,
      minRiskScore: 0,
      maxRiskScore: 60,
    },
    {
      name: 'Starter Savings Pool',
      description: 'Beginner-friendly savings group with low contributions. $100/month for 6 months.',
      monthlyContribution: 100,
      duration: 6,
      isFeatured: false,
      conversionRate: 0.65,
      totalViews: 2100,
      totalBookings: 15,
      minRiskScore: 0,
      maxRiskScore: 100,
    },
    {
      name: 'Diamond Elite Circle',
      description: 'Exclusive high-value savings group. $1000/month for 24 months. Verified members only.',
      monthlyContribution: 1000,
      duration: 24,
      isFeatured: true,
      conversionRate: 0.92,
      totalViews: 450,
      totalBookings: 20,
      minRiskScore: 0,
      maxRiskScore: 25,
    },
    {
      name: 'Quick Save Sprint',
      description: 'Short-term intensive savings. $250/month for just 4 months.',
      monthlyContribution: 250,
      duration: 4,
      isFeatured: false,
      conversionRate: 0.55,
      totalViews: 3200,
      totalBookings: 2,
      minRiskScore: 0,
      maxRiskScore: 100,
    },
    {
      name: 'Family Prosperity Fund',
      description: 'Family-oriented savings group with moderate contributions. $400/month for 10 months.',
      monthlyContribution: 400,
      duration: 10,
      isFeatured: true,
      conversionRate: 0.78,
      totalViews: 1800,
      totalBookings: 7,
      minRiskScore: 0,
      maxRiskScore: 50,
    },
  ];

  const jameyas = [];

  for (const config of jameyaConfigs) {
    const jameya = await prisma.jameya.create({
      data: {
        name: config.name,
        description: config.description,
        monthlyContribution: config.monthlyContribution,
        duration: config.duration,
        currency: 'USD',
        status: JameyaStatus.ACTIVE,
        isFeatured: config.isFeatured,
        conversionRate: config.conversionRate,
        totalViews: config.totalViews,
        totalBookings: config.totalBookings,
        minRiskScore: config.minRiskScore,
        maxRiskScore: config.maxRiskScore,
      },
    });

    // Generate seats
    const seats = [];
    for (let i = 1; i <= config.duration; i++) {
      const basePrice = config.monthlyContribution * config.duration;
      const discount = ((i - 1) / config.duration) * 0.3;
      const joiningPrice = Math.round(basePrice * (1 - discount) * 100) / 100;

      seats.push({
        jameyaId: jameya.id,
        seatNumber: i,
        joiningPrice,
        status: SeatStatus.AVAILABLE,
      });
    }

    await prisma.seat.createMany({ data: seats });
    jameyas.push(jameya);
  }

  console.log(`  Created ${jameyas.length} Jameyas with seats`);

  // Mark some seats as CONFIRMED to simulate partial fills
  const goldSeats = await prisma.seat.findMany({
    where: { jameyaId: jameyas[0].id },
    orderBy: { seatNumber: 'asc' },
  });

  // Confirm first 8 seats of Gold Circle (only 4 left!)
  for (let i = 0; i < 8 && i < goldSeats.length; i++) {
    await prisma.seat.update({
      where: { id: goldSeats[i].id },
      data: { status: SeatStatus.CONFIRMED },
    });
  }

  // Confirm first 2 seats of Quick Save Sprint
  const quickSeats = await prisma.seat.findMany({
    where: { jameyaId: jameyas[4].id },
    orderBy: { seatNumber: 'asc' },
  });

  for (let i = 0; i < 2 && i < quickSeats.length; i++) {
    await prisma.seat.update({
      where: { id: quickSeats[i].id },
      data: { status: SeatStatus.CONFIRMED },
    });
  }

  // ==========================================================================
  // BULK SEED FOR CHALLENGE (5000 Jameyas)
  // ==========================================================================
  console.log('\n🚀 Bulk-seeding 5000 Jameyas to satisfy the challenge constraint...');
  const bulkJameyasData = [];
  for (let i = 0; i < 5000; i++) {
    const duration = Math.floor(Math.random() * 12) + 6; // 6 to 17 months
    bulkJameyasData.push({
      name: `Community Fund ${i + 1}`,
      description: 'Auto-generated Jameya for high volume testing',
      monthlyContribution: Math.floor(Math.random() * 90) * 10 + 100, // 100 to 1000
      duration,
      currency: 'USD',
      status: JameyaStatus.ACTIVE,
      isFeatured: Math.random() > 0.95, // 5% featured
      conversionRate: Math.random(),
      totalViews: Math.floor(Math.random() * 1000),
      totalBookings: Math.floor(Math.random() * 50),
      minRiskScore: 0,
      maxRiskScore: 100,
    });
  }

  // Insert all 5000 Jameyas rapidly and get their IDs back
  // (Available natively starting in Prisma v5)
  const bulkJameyas = await prisma.jameya.createManyAndReturn({
    data: bulkJameyasData,
    skipDuplicates: true,
  });

  console.log(`  Inserted ${bulkJameyas.length} bulk Jameyas. Generating roughly ~50,000 seats...`);

  const bulkSeatsData = [];
  for (const j of bulkJameyas) {
    const duration = j.duration;
    for (let i = 1; i <= duration; i++) {
      const basePrice = j.monthlyContribution * duration;
      const discount = ((i - 1) / duration) * 0.3;
      const joiningPrice = Math.round(basePrice * (1 - discount) * 100) / 100;

      bulkSeatsData.push({
        jameyaId: j.id,
        seatNumber: i,
        joiningPrice,
        status: Math.random() > 0.8 ? SeatStatus.CONFIRMED : SeatStatus.AVAILABLE, // ~20% already taken by ghost users
      });
    }
  }

  // Postgres limits placeholders per query. We chunk the 50k seats by 5000 rows.
  const chunkSize = 5000;
  let insertedSeats = 0;
  for (let i = 0; i < bulkSeatsData.length; i += chunkSize) {
    const chunk = bulkSeatsData.slice(i, i + chunkSize);
    await prisma.seat.createMany({ data: chunk });
    insertedSeats += chunk.length;
  }
  console.log(`  Inserted ${insertedSeats} total seats for bulk Jameyas.`);

  // Update jameyas list so the summary correctly counts them
  jameyas.push(...bulkJameyas);

  // ==========================================================================
  // SUMMARY
  // ==========================================================================
  console.log('\n✅ Seed complete!\n');
  console.log('📊 Summary:');
  console.log(`  Users: ${users.length}`);
  console.log(`  Jameyas: ${jameyas.length}`);
  console.log(`  Total seats: ${jameyaConfigs.reduce((sum, j) => sum + j.duration, 0)}`);
  console.log('\n📋 Test users:');
  users.forEach((u) => {
    console.log(`  ${u.name} (${u.email}) — KYC: ${u.kycStatus}, Risk: ${u.riskScore}`);
  });
  console.log('\n🏦 Jameyas:');
  jameyas.forEach((j, idx) => {
    const config = jameyaConfigs[idx];
    console.log(`  ${j.name} — $${config.monthlyContribution}/mo × ${config.duration}mo`);
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Seed failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
