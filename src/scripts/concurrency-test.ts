/**
 * ============================================================================
 * CONCURRENCY TEST SCRIPT
 * ============================================================================
 * Simulates 1000 users trying to book the same Jameya seat simultaneously.
 *
 * This script validates:
 * - No double bookings occur
 * - Only ONE user gets the seat
 * - All other requests are properly rejected
 * - System remains consistent under load
 *
 * Usage:
 *   npx ts-node src/scripts/concurrency-test.ts
 *
 * Prerequisites:
 *   - Server must be running on localhost:3000
 *   - Database must be seeded (npm run prisma:seed)
 * ============================================================================
 */

const BASE_URL = 'http://localhost:3000/api';

interface TestResult {
  userId: string;
  status: 'success' | 'conflict' | 'error';
  responseTime: number;
  response?: any;
  error?: string;
}

async function fetchJSON(url: string, options: RequestInit = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const data = await response.json();
  return { status: response.status, data };
}

async function setupTestData() {
  console.log('📦 Setting up test data...\n');

  // Create a test Jameya with limited seats
  const { data: jameya } = await fetchJSON(`${BASE_URL}/jameyas`, {
    method: 'POST',
    body: JSON.stringify({
      name: 'Concurrency Test Jameya',
      description: 'Testing 1000 concurrent users',
      monthlyContribution: 200,
      duration: 3, // Only 3 seats!
    }),
  });

  console.log(`  Created Jameya: ${jameya.id} with ${jameya.seats?.length || 3} seats`);

  // Create test users
  const users: string[] = [];
  const CONCURRENT_USERS = 50; // Use 50 for practical testing (increase to 1000 for stress test)

  console.log(`  Creating ${CONCURRENT_USERS} test users...`);

  for (let i = 0; i < CONCURRENT_USERS; i++) {
    const { data: user } = await fetchJSON(`${BASE_URL}/users`, {
      method: 'POST',
      body: JSON.stringify({
        email: `concurrent_test_${i}_${Date.now()}@test.com`,
        name: `Test User ${i}`,
      }),
    });

    // Set KYC to verified
    await fetchJSON(`${BASE_URL}/users/${user.id}/kyc`, {
      method: 'PATCH',
      body: JSON.stringify({ kycStatus: 'VERIFIED' }),
    });

    users.push(user.id);
  }

  console.log(`  Created ${users.length} verified users`);

  // Get available seats
  const { data: seats } = await fetchJSON(
    `${BASE_URL}/seats/jameya/${jameya.id}/available`,
  );

  const targetSeatId = seats[0]?.id;

  if (!targetSeatId) {
    throw new Error('No available seats found');
  }

  console.log(`  Target seat: ${targetSeatId}\n`);

  return { jameyaId: jameya.id, seatId: targetSeatId, userIds: users };
}

async function runConcurrencyTest(seatId: string, userIds: string[]) {
  console.log(`🏁 Starting concurrency test: ${userIds.length} users racing for 1 seat\n`);

  const startTime = Date.now();

  // Fire ALL reservation requests simultaneously
  const promises = userIds.map(async (userId, index): Promise<TestResult> => {
    const requestStart = Date.now();
    const idempotencyKey = `concurrency_test_${userId}_${seatId}_${Date.now()}`;

    try {
      const { status, data } = await fetchJSON(`${BASE_URL}/reservations`, {
        method: 'POST',
        headers: {
          'x-idempotency-key': idempotencyKey,
        },
        body: JSON.stringify({
          userId,
          seatId,
          idempotencyKey,
        }),
      });

      const responseTime = Date.now() - requestStart;

      if (status === 201 || status === 200) {
        return {
          userId,
          status: 'success',
          responseTime,
          response: data,
        };
      }

      return {
        userId,
        status: 'conflict',
        responseTime,
        response: data,
      };
    } catch (err: any) {
      return {
        userId,
        status: 'error',
        responseTime: Date.now() - requestStart,
        error: err.message,
      };
    }
  });

  const results = await Promise.all(promises);
  const totalTime = Date.now() - startTime;

  // ==========================================================================
  // ANALYZE RESULTS
  // ==========================================================================
  console.log('📊 RESULTS\n');
  console.log(`Total execution time: ${totalTime}ms`);
  console.log(`Requests fired: ${results.length}`);

  const successes = results.filter((r) => r.status === 'success');
  const conflicts = results.filter((r) => r.status === 'conflict');
  const errors = results.filter((r) => r.status === 'error');

  console.log(`\n  ✅ Successful reservations: ${successes.length}`);
  console.log(`  ❌ Conflicts (seat taken):   ${conflicts.length}`);
  console.log(`  ⚠️  Errors:                   ${errors.length}`);

  // Response time stats
  const responseTimes = results.map((r) => r.responseTime);
  const avgTime = Math.round(
    responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length,
  );
  const maxTime = Math.max(...responseTimes);
  const minTime = Math.min(...responseTimes);
  const p95Index = Math.floor(responseTimes.length * 0.95);
  const sortedTimes = [...responseTimes].sort((a, b) => a - b);
  const p95Time = sortedTimes[p95Index];

  console.log(`\n⏱  Response Times:`);
  console.log(`  Min:  ${minTime}ms`);
  console.log(`  Avg:  ${avgTime}ms`);
  console.log(`  P95:  ${p95Time}ms`);
  console.log(`  Max:  ${maxTime}ms`);

  // Validation
  console.log('\n🔍 VALIDATION\n');

  if (successes.length === 1) {
    console.log('  ✅ PASS: Exactly 1 user got the seat (no double booking)');
    console.log(`  Winner: ${successes[0].userId}`);
  } else if (successes.length === 0) {
    console.log('  ⚠️  WARN: No user got the seat (possible lock timeout)');
  } else {
    console.log(
      `  ❌ FAIL: ${successes.length} users got the seat (DOUBLE BOOKING DETECTED!)`,
    );
    successes.forEach((s) => {
      console.log(`    - User: ${s.userId}`);
    });
  }

  if (errors.length > 0) {
    console.log(`\n  ⚠️  Errors encountered:`);
    errors.slice(0, 5).forEach((e) => {
      console.log(`    - ${e.userId}: ${e.error}`);
    });
    if (errors.length > 5) {
      console.log(`    ... and ${errors.length - 5} more`);
    }
  }

  return {
    totalUsers: userIds.length,
    successes: successes.length,
    conflicts: conflicts.length,
    errors: errors.length,
    totalTimeMs: totalTime,
    avgResponseTimeMs: avgTime,
    p95ResponseTimeMs: p95Time,
    passed: successes.length === 1,
  };
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  JAMEYA MARKETPLACE — CONCURRENCY TEST');
  console.log('  Simulating high-contention seat booking');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    const { seatId, userIds } = await setupTestData();
    const results = await runConcurrencyTest(seatId, userIds);

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log(results.passed ? '  ✅ TEST PASSED' : '  ❌ TEST FAILED');
    console.log('═══════════════════════════════════════════════════════════\n');

    process.exit(results.passed ? 0 : 1);
  } catch (error) {
    console.error('\n❌ Test setup failed:', error);
    process.exit(1);
  }
}

main();
