const ROLE_HIERARCHY = {
  super_admin: 3,
  admin: 2,
  subscriber: 1,
};

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const userLevel = ROLE_HIERARCHY[req.user.role] || 0;
    const hasAccess = allowedRoles.some(role => userLevel >= ROLE_HIERARCHY[role]);
    if (!hasAccess) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        required: allowedRoles,
        current: req.user.role,
      });
    }
    next();
  };
}

function requireAdmin(req, res, next) {
  return requireRole('admin')(req, res, next);
}

function requireSuperAdmin(req, res, next) {
  return requireRole('super_admin')(req, res, next);
}

module.exports = { ROLE_HIERARCHY, requireRole, requireAdmin, requireSuperAdmin };
