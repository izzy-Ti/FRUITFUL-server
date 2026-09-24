import { BadRequestException } from '@nestjs/common';
import { describe, it, expect } from 'vitest';
import { createGlobalValidationPipe } from './validation.pipe.js';
import { IsEmail, IsNotEmpty, MinLength } from 'class-validator';

class TestDto {
  @IsEmail()
  email!: string;

  @IsNotEmpty()
  @MinLength(6)
  password!: string;
}

describe('GlobalValidationPipe', () => {
  const pipe = createGlobalValidationPipe();

  it('should transform and accept valid input', async () => {
    const validData = {
      email: 'applicant@fruitful.example',
      password: 'SecurePassword123!',
    };

    const transformed = await pipe.transform(validData, {
      type: 'body',
      metatype: TestDto,
    });

    expect(transformed).toBeInstanceOf(TestDto);
    expect(transformed.email).toBe(validData.email);
  });

  it('should throw BadRequestException with formatted field errors on invalid input', async () => {
    const invalidData = {
      email: 'not-an-email',
      password: '123',
    };

    try {
      await pipe.transform(invalidData, {
        type: 'body',
        metatype: TestDto,
      });
      expect.fail('Should have thrown BadRequestException');
    } catch (err: any) {
      expect(err).toBeInstanceOf(BadRequestException);
      const response = err.getResponse();
      expect(response).toMatchObject({
        statusCode: 400,
        error: 'Validation Error',
        message: 'Request payload validation failed',
      });
      expect(response.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'email' }),
          expect.objectContaining({ field: 'password' }),
        ]),
      );
    }
  });

  it('should strip non-whitelisted properties', async () => {
    const dataWithExtra = {
      email: 'applicant@fruitful.example',
      password: 'SecurePassword123!',
      maliciousField: 'exploit',
    };

    // When forbidNonWhitelisted is true, it should reject non-whitelisted fields
    try {
      await pipe.transform(dataWithExtra, {
        type: 'body',
        metatype: TestDto,
      });
      expect.fail('Should have rejected non-whitelisted properties');
    } catch (err: any) {
      expect(err).toBeInstanceOf(BadRequestException);
      const response = err.getResponse();
      expect(response.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'maliciousField' }),
        ]),
      );
    }
  });
});
