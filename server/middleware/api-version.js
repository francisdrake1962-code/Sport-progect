const CURRENT_API_VERSION = 'v1';
const SUPPORTED_VERSIONS = ['v1'];

function apiVersionMiddleware(req, res, next) {
  res.setHeader('X-API-Version', CURRENT_API_VERSION);
  res.setHeader('X-API-Supported', SUPPORTED_VERSIONS.join(', '));

  const requestedVersion = req.headers['x-api-version'] || req.query._api_version;
  if (requestedVersion && !SUPPORTED_VERSIONS.includes(requestedVersion)) {
    return res.status(400).json({
      error: 'Unsupported API version',
      requested: requestedVersion,
      supported: SUPPORTED_VERSIONS,
    });
  }
  next();
}

module.exports = { apiVersionMiddleware, CURRENT_API_VERSION };
