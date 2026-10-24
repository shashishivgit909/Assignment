/**
 * Middleware to enforce tenant isolation via the x-tenant-id header.
 * Assumption:
 * In a real-world enterprise architecture, tenant identity is cryptographically signed
 * into a JWT or OAuth bearer token verified at the API Gateway or authentication middleware.
 * For this exercise, x-tenant-id represents the authenticated tenant context.
 */

function requireTenantAuth(req, res, next) {
  const tenantId = req.headers['x-tenant-id'];

  if (!tenantId || typeof tenantId !== 'string' || tenantId.trim().length === 0) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'TENANT_AUTH_REQUIRED',
        message: 'Missing or empty required header: x-tenant-id. Tenant context is mandatory for this resource.'
      }
    });
  }

  req.tenantId = tenantId.trim();
  next();
}

function optionalTenantAuth(req, res, next) {
  const tenantId = req.headers['x-tenant-id'];
  if (tenantId && typeof tenantId === 'string' && tenantId.trim().length > 0) {
    req.tenantId = tenantId.trim();
  }
  next();
}

module.exports = {
  requireTenantAuth,
  optionalTenantAuth
};
