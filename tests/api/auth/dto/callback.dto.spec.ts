import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CallbackRequestDto } from '../../../../src/api/auth/dto/callback.dto';

describe('CallbackRequestDto', () => {
  describe('code validation', () => {
    it('should reject empty code', async () => {
      const dto = plainToInstance(CallbackRequestDto, {
        code: '',
        state: 'valid-state',
      });
      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
      const codeError = errors.find((e) => e.property === 'code');
      expect(codeError).toBeDefined();
      expect(codeError?.constraints).toHaveProperty('isNotEmpty');
      expect(codeError?.constraints?.isNotEmpty).toBe('Authorization code is required');
    });

    it('should reject undefined code', async () => {
      const dto = plainToInstance(CallbackRequestDto, {
        state: 'valid-state',
      });
      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
      const codeError = errors.find((e) => e.property === 'code');
      expect(codeError).toBeDefined();
      expect(codeError?.constraints).toHaveProperty('isNotEmpty');
    });

    it('should accept valid code', async () => {
      const dto = plainToInstance(CallbackRequestDto, {
        code: 'auth-code-12345',
        state: 'random-state-67890',
      });
      const errors = await validate(dto);
      const codeError = errors.find((e) => e.property === 'code');

      expect(codeError).toBeUndefined();
    });

    it('should accept alphanumeric code with hyphens', async () => {
      const dto = plainToInstance(CallbackRequestDto, {
        code: 'auth-code-abc-123-xyz',
        state: 'state-456',
      });
      const errors = await validate(dto);
      const codeError = errors.find((e) => e.property === 'code');

      expect(codeError).toBeUndefined();
    });
  });

  describe('state validation', () => {
    it('should reject empty state', async () => {
      const dto = plainToInstance(CallbackRequestDto, {
        code: 'valid-code',
        state: '',
      });
      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
      const stateError = errors.find((e) => e.property === 'state');
      expect(stateError).toBeDefined();
      expect(stateError?.constraints).toHaveProperty('isNotEmpty');
      expect(stateError?.constraints?.isNotEmpty).toBe('State parameter is required');
    });

    it('should reject undefined state', async () => {
      const dto = plainToInstance(CallbackRequestDto, {
        code: 'valid-code',
      });
      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
      const stateError = errors.find((e) => e.property === 'state');
      expect(stateError).toBeDefined();
      expect(stateError?.constraints).toHaveProperty('isNotEmpty');
    });

    it('should accept valid state', async () => {
      const dto = plainToInstance(CallbackRequestDto, {
        code: 'auth-code-12345',
        state: 'random-state-67890',
      });
      const errors = await validate(dto);
      const stateError = errors.find((e) => e.property === 'state');

      expect(stateError).toBeUndefined();
    });

    it('should accept UUID-format state', async () => {
      const dto = plainToInstance(CallbackRequestDto, {
        code: 'code-123',
        state: '550e8400-e29b-41d4-a716-446655440000',
      });
      const errors = await validate(dto);
      const stateError = errors.find((e) => e.property === 'state');

      expect(stateError).toBeUndefined();
    });
  });

  describe('combined validation', () => {
    it('should accept valid code and state', async () => {
      const dto = plainToInstance(CallbackRequestDto, {
        code: 'auth-code-12345',
        state: 'random-state-67890',
      });
      const errors = await validate(dto);

      expect(errors.length).toBe(0);
    });

    it('should reject when both code and state are empty', async () => {
      const dto = plainToInstance(CallbackRequestDto, {
        code: '',
        state: '',
      });
      const errors = await validate(dto);

      expect(errors.length).toBe(2);
      expect(errors.find((e) => e.property === 'code')).toBeDefined();
      expect(errors.find((e) => e.property === 'state')).toBeDefined();
    });

    it('should reject when both code and state are missing', async () => {
      const dto = plainToInstance(CallbackRequestDto, {});
      const errors = await validate(dto);

      expect(errors.length).toBe(2);
      expect(errors.find((e) => e.property === 'code')).toBeDefined();
      expect(errors.find((e) => e.property === 'state')).toBeDefined();
    });
  });

  describe('DTO transformation', () => {
    it('should properly transform plain object to DTO instance', () => {
      const plain = {
        code: 'auth-code-123',
        state: 'state-456',
      };
      const dto = plainToInstance(CallbackRequestDto, plain);

      expect(dto).toBeInstanceOf(CallbackRequestDto);
      expect(dto.code).toBe(plain.code);
      expect(dto.state).toBe(plain.state);
    });

    it('should handle extra properties gracefully', async () => {
      const plain = {
        code: 'auth-code-123',
        state: 'state-456',
        extraProperty: 'should be ignored',
        anotherExtra: 123,
      };
      const dto = plainToInstance(CallbackRequestDto, plain);
      const errors = await validate(dto);

      expect(errors.length).toBe(0);
      expect(dto.code).toBe(plain.code);
      expect(dto.state).toBe(plain.state);
    });

    it('should preserve special characters in code and state', async () => {
      const dto = plainToInstance(CallbackRequestDto, {
        code: 'code_with-special.chars123',
        state: 'state+with=special&chars',
      });
      const errors = await validate(dto);

      expect(errors.length).toBe(0);
      expect(dto.code).toBe('code_with-special.chars123');
      expect(dto.state).toBe('state+with=special&chars');
    });
  });

  describe('edge cases', () => {
    it('should handle very long code values', async () => {
      const longCode = 'a'.repeat(1000);
      const dto = plainToInstance(CallbackRequestDto, {
        code: longCode,
        state: 'state-123',
      });
      const errors = await validate(dto);

      expect(errors.length).toBe(0);
      expect(dto.code).toBe(longCode);
    });

    it('should handle very long state values', async () => {
      const longState = 'b'.repeat(1000);
      const dto = plainToInstance(CallbackRequestDto, {
        code: 'code-123',
        state: longState,
      });
      const errors = await validate(dto);

      expect(errors.length).toBe(0);
      expect(dto.state).toBe(longState);
    });

    it('should accept whitespace-only code (IsString allows it)', async () => {
      const dto = plainToInstance(CallbackRequestDto, {
        code: '   ',
        state: 'state-123',
      });
      const errors = await validate(dto);

      // IsString + IsNotEmpty allows whitespace strings
      expect(errors.length).toBe(0);
    });

    it('should accept whitespace-only state (IsString allows it)', async () => {
      const dto = plainToInstance(CallbackRequestDto, {
        code: 'code-123',
        state: '   ',
      });
      const errors = await validate(dto);

      // IsString + IsNotEmpty allows whitespace strings
      expect(errors.length).toBe(0);
    });
  });
});
