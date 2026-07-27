const DANGEROUS_ACTIONS = {
  'DELETE /api/user/account': 'Account deletion requires confirmation',
};

function requireConfirmation(req, res, next) {
  const key = `${req.method} ${req.path}`;
  if (DANGEROUS_ACTIONS[key]) {
    const confirmed = req.headers['x-confirm-action'] === 'true' || req.body?.confirm === true;
    if (!confirmed) {
      return res.status(428).json({
        error: 'Confirmation required',
        message: DANGEROUS_ACTIONS[key],
        header: 'X-Confirm-Action: true',
      });
    }
  }
  next();
}

function requireDangerousActionConfirmation(req, res, next) {
  if (req.method === 'DELETE') {
    const confirmed = req.headers['x-confirm-action'] === 'true' || req.body?.confirm === true;
    if (!confirmed) {
      return res.status(428).json({
        error: 'Confirmation required',
        message: 'Dangerous action requires confirmation',
        header: 'X-Confirm-Action: true',
      });
    }
  }
  next();
}

module.exports = { requireConfirmation, requireDangerousActionConfirmation };
