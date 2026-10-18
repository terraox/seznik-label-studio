/**
 * OpenAPI inventory for admin functionalities.
 * Most /api/admin/* routes are NOT implemented yet — this document is the checklist.
 * Implemented today: mobile auth (/api/auth/*) + admin session (/api/admin/login|logout|me) + printers catalog names.
 */
export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'SEZ Print Admin API',
    version: '0.1.0',
    description:
      'Inventory of admin-panel capabilities to implement in this Next.js admin app. ' +
      'Status tags: implemented | planned. Do not treat planned routes as live.',
  },
  servers: [{ url: '/', description: 'This admin app' }],
  tags: [
    { name: 'Mobile Auth', description: 'App register / login (implemented)' },
    { name: 'Admin Auth', description: 'Console cookie session (implemented)' },
    { name: 'Overview', description: 'planned' },
    { name: 'Users', description: 'planned' },
    { name: 'Printers', description: 'partial — catalog names implemented' },
    { name: 'Traffic', description: 'planned' },
    { name: 'Feedback', description: 'planned' },
    { name: 'Access Codes', description: 'planned' },
    { name: 'Support', description: 'planned' },
    { name: 'Health', description: 'planned' },
  ],
  paths: {
    '/api/app/register': {
      post: {
        tags: ['Mobile Auth'],
        summary: 'Register app user',
        'x-status': 'implemented',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'mobile', 'password'],
                properties: {
                  name: { type: 'string' },
                  mobile: { type: 'string', description: '10-digit Indian mobile' },
                  password: { type: 'string', minLength: 8 },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Created; returns user without password' },
          '409': { description: 'Mobile already registered' },
        },
      },
    },
    '/api/app/login': {
      post: {
        tags: ['Mobile Auth'],
        summary: 'Login with mobile + password',
        'x-status': 'implemented',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['mobile', 'password'],
                properties: {
                  mobile: { type: 'string' },
                  password: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Session token + user (includes printerName if set)' },
          '401': { description: 'Invalid credentials' },
        },
      },
    },
    '/api/app/me': {
      get: {
        tags: ['Mobile Auth'],
        summary: 'Current app user',
        'x-status': 'implemented',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'User profile' }, '401': { description: 'Unauthorized' } },
      },
    },
    '/api/app/printer': {
      post: {
        tags: ['Mobile Auth'],
        summary: 'Set purchased printer after register',
        'x-status': 'implemented',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['printerId'],
                properties: {
                  printerId: { type: 'string', enum: ['tejas', 'rudra', 'josh'] },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'Updated user with printerName' } },
      },
    },
    '/api/admin/login': {
      post: {
        tags: ['Admin Auth'],
        summary: 'Admin console login',
        'x-status': 'implemented',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { userId: { type: 'string' }, password: { type: 'string' } },
              },
            },
          },
        },
        responses: { '200': { description: 'Sets session cookie' } },
      },
    },
    '/api/admin/logout': {
      post: {
        tags: ['Admin Auth'],
        summary: 'Admin logout',
        'x-status': 'implemented',
        responses: { '200': { description: 'Clears cookie' } },
      },
    },
    '/api/admin/me': {
      get: {
        tags: ['Admin Auth'],
        summary: 'Admin session',
        'x-status': 'implemented',
        responses: { '200': { description: '{ userId }' } },
      },
    },
    '/api/admin/printers/catalog': {
      get: {
        tags: ['Printers'],
        summary: 'Printer product names (Tejas / Rudra / Josh)',
        'x-status': 'implemented',
        responses: { '200': { description: 'Catalog with printerName fields' } },
      },
    },
    '/api/admin/metrics': {
      get: {
        tags: ['Overview'],
        summary: 'Dashboard KPIs',
        'x-status': 'planned',
        parameters: [{ name: 'timeRange', in: 'query', schema: { type: 'string' } }],
        responses: { '501': { description: 'Not implemented — see admin-panel' } },
      },
    },
    '/api/admin/heatmap': {
      get: {
        tags: ['Overview'],
        summary: 'Peak usage heatmap (IST)',
        'x-status': 'planned',
        responses: { '501': { description: 'Not implemented' } },
      },
    },
    '/api/admin/devices': {
      get: {
        tags: ['Overview'],
        summary: 'Device / session breakdown',
        'x-status': 'planned',
        responses: { '501': { description: 'Not implemented' } },
      },
    },
    '/api/admin/sections': {
      get: {
        tags: ['Overview'],
        summary: 'Section & feature traffic',
        'x-status': 'planned',
        responses: { '501': { description: 'Not implemented' } },
      },
    },
    '/api/admin/sections/summary': {
      get: {
        tags: ['Overview'],
        summary: 'Sections summary',
        'x-status': 'planned',
        responses: { '501': { description: 'Not implemented' } },
      },
    },
    '/api/admin/profiles': {
      get: {
        tags: ['Overview'],
        summary: 'Business profile analytics',
        'x-status': 'planned',
        responses: { '501': { description: 'Not implemented' } },
      },
    },
    '/api/admin/profiles/{businessType}/sections': {
      get: {
        tags: ['Overview'],
        summary: 'Sections for one business type',
        'x-status': 'planned',
        parameters: [{ name: 'businessType', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '501': { description: 'Not implemented' } },
      },
    },
    '/api/admin/users': {
      get: {
        tags: ['Users'],
        summary: 'Registered users roster (include printerName)',
        'x-status': 'planned',
        responses: { '501': { description: 'Not implemented' } },
      },
    },
    '/api/admin/users/{id}/ban': {
      post: {
        tags: ['Users'],
        summary: 'Ban user',
        'x-status': 'planned',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '501': { description: 'Not implemented' } },
      },
    },
    '/api/admin/users/{id}/unban': {
      post: {
        tags: ['Users'],
        summary: 'Unban user',
        'x-status': 'planned',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '501': { description: 'Not implemented' } },
      },
    },
    '/api/admin/users/{id}/seznik': {
      post: {
        tags: ['Users'],
        summary: 'Toggle seznik flag',
        'x-status': 'planned',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '501': { description: 'Not implemented' } },
      },
    },
    '/api/admin/printers/summary': {
      get: {
        tags: ['Printers'],
        summary: 'Bluetooth printer connection frequency',
        'x-status': 'planned',
        responses: { '501': { description: 'Not implemented' } },
      },
    },
    '/api/admin/printers/user-logs': {
      get: {
        tags: ['Printers'],
        summary: 'Per-user printer connection logs',
        'x-status': 'planned',
        responses: { '501': { description: 'Not implemented' } },
      },
    },
    '/api/admin/invoices': {
      get: {
        tags: ['Traffic'],
        summary: 'Invoice traffic list',
        'x-status': 'planned',
        responses: { '501': { description: 'Not implemented' } },
      },
    },
    '/api/admin/products': {
      get: {
        tags: ['Traffic'],
        summary: 'Product list for redirects',
        'x-status': 'planned',
        responses: { '501': { description: 'Not implemented' } },
      },
    },
    '/api/admin/feedback': {
      get: {
        tags: ['Feedback'],
        summary: 'Reviews & suggestions',
        'x-status': 'planned',
        responses: { '501': { description: 'Not implemented' } },
      },
    },
    '/api/admin/access-codes/generate': {
      post: {
        tags: ['Access Codes'],
        summary: 'Generate access-code batch',
        'x-status': 'planned',
        responses: { '501': { description: 'Not implemented' } },
      },
    },
    '/api/admin/access-codes': {
      get: {
        tags: ['Access Codes'],
        summary: 'List access codes',
        'x-status': 'planned',
        responses: { '501': { description: 'Not implemented' } },
      },
    },
    '/api/admin/access-codes/batches': {
      get: {
        tags: ['Access Codes'],
        summary: 'List batches',
        'x-status': 'planned',
        responses: { '501': { description: 'Not implemented' } },
      },
    },
    '/api/admin/access-codes/issuers': {
      get: {
        tags: ['Access Codes'],
        summary: 'Issuer stats',
        'x-status': 'planned',
        responses: { '501': { description: 'Not implemented' } },
      },
    },
    '/api/admin/access-codes/batch/{batchId}': {
      get: {
        tags: ['Access Codes'],
        summary: 'Codes in a batch',
        'x-status': 'planned',
        parameters: [{ name: 'batchId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '501': { description: 'Not implemented' } },
      },
    },
    '/api/admin/access-codes/search': {
      get: {
        tags: ['Access Codes'],
        summary: 'Lookup one code',
        'x-status': 'planned',
        responses: { '501': { description: 'Not implemented' } },
      },
    },
    '/api/admin/support-agents': {
      get: {
        tags: ['Support'],
        summary: 'List support agents',
        'x-status': 'planned',
        responses: { '501': { description: 'Not implemented' } },
      },
      post: {
        tags: ['Support'],
        summary: 'Create support agent',
        'x-status': 'planned',
        responses: { '501': { description: 'Not implemented' } },
      },
    },
    '/api/admin/support-agents/{id}/disable': {
      post: {
        tags: ['Support'],
        summary: 'Disable agent',
        'x-status': 'planned',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '501': { description: 'Not implemented' } },
      },
    },
    '/api/admin/support-agents/{id}/enable': {
      post: {
        tags: ['Support'],
        summary: 'Enable agent',
        'x-status': 'planned',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '501': { description: 'Not implemented' } },
      },
    },
    '/api/admin/support-agents/{id}/reset-password': {
      post: {
        tags: ['Support'],
        summary: 'Reset agent password',
        'x-status': 'planned',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '501': { description: 'Not implemented' } },
      },
    },
    '/api/admin/support-agents/{id}': {
      delete: {
        tags: ['Support'],
        summary: 'Delete agent',
        'x-status': 'planned',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '501': { description: 'Not implemented' } },
      },
    },
    '/api/admin/health': {
      get: {
        tags: ['Health'],
        summary: 'Admin API health',
        'x-status': 'planned',
        responses: { '501': { description: 'Not implemented' } },
      },
    },
    '/api/support/login': {
      post: {
        tags: ['Support'],
        summary: 'Support portal login',
        'x-status': 'planned',
        responses: { '501': { description: 'Not implemented' } },
      },
    },
    '/api/support/access-codes/issue': {
      post: {
        tags: ['Support'],
        summary: 'Issue customer access code',
        'x-status': 'planned',
        responses: { '501': { description: 'Not implemented' } },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'opaque' },
    },
  },
} as const;
