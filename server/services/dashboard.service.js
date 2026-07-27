const { getDb } = require('../db');

function queryToScalar(result) {
  if (!result.length || !result[0].values.length) return 0;
  return result[0].values[0][0];
}

async function getStats() {
  const db = await getDb();
  const totalUsers = queryToScalar(db.exec(`SELECT COUNT(*) as count FROM subscribers`));
  const activeUsers = queryToScalar(db.exec(`SELECT COUNT(*) as count FROM subscribers WHERE status = 'active'`));
  const totalLessons = queryToScalar(db.exec(`SELECT COUNT(*) as count FROM lessons`));
  const totalReviews = queryToScalar(db.exec(`SELECT COUNT(*) as count FROM reviews`));
  const revenue = queryToScalar(db.exec(`SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE status = 'success'`));
  const openTickets = queryToScalar(db.exec(`SELECT COUNT(*) as count FROM tickets WHERE status != 'resolved'`));
  const subCount = queryToScalar(db.exec(`SELECT COUNT(*) as count FROM subscribers WHERE status = 'active' OR status = 'trial'`));
  const paidCount = queryToScalar(db.exec(`SELECT COUNT(*) as count FROM subscribers WHERE (plan = 'annual' OR plan = 'monthly') AND status = 'active'`));
  const conversionRate = subCount > 0 ? Math.round((paidCount / subCount) * 100) : 0;

  return {
    totalUsers,
    activeUsers,
    totalLessons,
    totalReviews,
    openTickets,
    monthlyRevenue: revenue,
    conversionRate,
  };
}

module.exports = { getStats };
