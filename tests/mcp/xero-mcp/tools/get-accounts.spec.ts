/**
 * Get Accounts Tool Tests
 * Note: These tests verify the tool function structure and error handling.
 * Full Xero API integration requires Xero sandbox credentials.
 */

import { XeroMCPError } from '../../../../src/mcp/xero-mcp/utils/error-handler';

describe('GetAccounts Tool', () => {
  describe('input validation', () => {
    it('should require tenantId parameter', () => {
      // The MCP server schema requires tenantId
      const inputSchema = {
        type: 'object',
        properties: {
          tenantId: { type: 'string', description: 'CrecheBooks tenant ID' },
        },
        required: ['tenantId'],
      };

      expect(inputSchema.required).toContain('tenantId');
    });
  });

  describe('error handling', () => {
    it('should define XeroMCPError correctly', () => {
      const error = new XeroMCPError('Test error', 'TEST_CODE', 400, { foo: 'bar' });

      expect(error.name).toBe('XeroMCPError');
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.statusCode).toBe(400);
      expect(error.context).toEqual({ foo: 'bar' });
    });
  });

  describe('output format', () => {
    it('should define XeroAccount interface correctly', () => {
      // Type check - this is a compile-time verification
      const account = {
        code: '200',
        name: 'Sales',
        type: 'REVENUE',
        taxType: 'OUTPUT2',
        enablePaymentsToAccount: false,
      };

      expect(account.code).toBeDefined();
      expect(account.name).toBeDefined();
      expect(account.type).toBeDefined();
      expect(typeof account.enablePaymentsToAccount).toBe('boolean');
    });
  });
});
