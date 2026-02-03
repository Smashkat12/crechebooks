/**
 * TASK-QUOTE-002: Public Quote Controller Tests
 * Tests for public quote acceptance portal endpoints
 *
 * @module api/public/quotes/tests
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PublicQuoteController } from './public-quote.controller';
import { QuoteService } from '../../../database/services/quote.service';
import {
  AcceptQuoteDto,
  DeclineQuoteDto,
  PublicQuoteResponse,
} from './dto/quote-action.dto';

describe('PublicQuoteController', () => {
  let controller: PublicQuoteController;
  let quoteService: jest.Mocked<QuoteService>;

  const mockViewToken = '550e8400-e29b-41d4-a716-446655440000';

  const mockPublicQuoteResponse: PublicQuoteResponse = {
    quoteNumber: 'Q2025-0001',
    recipientName: 'John Doe',
    childName: 'Jane Doe',
    expectedStartDate: new Date('2025-03-01'),
    quoteDate: new Date('2025-01-15'),
    expiryDate: new Date('2025-02-14'),
    validityDays: 30,
    subtotalCents: 350000,
    vatAmountCents: 0,
    totalCents: 350000,
    status: 'VIEWED',
    isExpired: false,
    canAccept: true,
    canDecline: true,
    lines: [
      {
        description: 'Monthly tuition fee',
        quantity: 1,
        unitPriceCents: 350000,
        lineTotalCents: 350000,
      },
    ],
    tenant: {
      name: 'Happy Kids Creche',
      phone: '+27 21 555 1234',
      email: 'info@happykids.co.za',
    },
  };

  beforeEach(async () => {
    const mockQuoteService = {
      getQuoteByViewTokenPublic: jest.fn(),
      acceptQuoteByToken: jest.fn(),
      declineQuoteByToken: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PublicQuoteController],
      providers: [
        {
          provide: QuoteService,
          useValue: mockQuoteService,
        },
      ],
    }).compile();

    controller = module.get<PublicQuoteController>(PublicQuoteController);
    quoteService = module.get(QuoteService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getQuoteByToken', () => {
    it('should return quote details for valid token', async () => {
      quoteService.getQuoteByViewTokenPublic.mockResolvedValue(
        mockPublicQuoteResponse,
      );

      const result = await controller.getQuoteByToken(mockViewToken);

      expect(result).toEqual(mockPublicQuoteResponse);
      expect(quoteService.getQuoteByViewTokenPublic).toHaveBeenCalledWith(
        mockViewToken,
      );
    });

    it('should throw NotFoundException for invalid token', async () => {
      quoteService.getQuoteByViewTokenPublic.mockRejectedValue(
        new NotFoundException('Quote not found or link expired'),
      );

      await expect(controller.getQuoteByToken(mockViewToken)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return isExpired true for expired quotes', async () => {
      const expiredQuote = {
        ...mockPublicQuoteResponse,
        status: 'EXPIRED',
        isExpired: true,
        canAccept: false,
        canDecline: false,
      };
      quoteService.getQuoteByViewTokenPublic.mockResolvedValue(expiredQuote);

      const result = await controller.getQuoteByToken(mockViewToken);

      expect(result.isExpired).toBe(true);
      expect(result.canAccept).toBe(false);
    });
  });

  describe('acceptQuote', () => {
    const acceptDto: AcceptQuoteDto = {
      confirmedBy: 'John Doe',
      email: 'john@example.com',
    };

    it('should accept quote and return success message', async () => {
      const expectedResponse = {
        success: true,
        message: 'Thank you! Quote Q2025-0001 has been accepted.',
        nextStep:
          'The creche will contact you to complete the enrollment process.',
      };
      quoteService.acceptQuoteByToken.mockResolvedValue(expectedResponse);

      const result = await controller.acceptQuote(mockViewToken, acceptDto);

      expect(result).toEqual(expectedResponse);
      expect(quoteService.acceptQuoteByToken).toHaveBeenCalledWith(
        mockViewToken,
        acceptDto.confirmedBy,
      );
    });

    it('should throw NotFoundException for invalid token', async () => {
      quoteService.acceptQuoteByToken.mockRejectedValue(
        new NotFoundException('Quote not found or link expired'),
      );

      await expect(
        controller.acceptQuote(mockViewToken, acceptDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for already accepted quote', async () => {
      quoteService.acceptQuoteByToken.mockRejectedValue(
        new BadRequestException('Cannot accept quote with status ACCEPTED'),
      );

      await expect(
        controller.acceptQuote(mockViewToken, acceptDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for expired quote', async () => {
      quoteService.acceptQuoteByToken.mockRejectedValue(
        new BadRequestException(
          'Quote has expired and can no longer be accepted',
        ),
      );

      await expect(
        controller.acceptQuote(mockViewToken, acceptDto),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('declineQuote', () => {
    const declineDto: DeclineQuoteDto = {
      reason: 'Fees are outside our budget',
    };

    it('should decline quote and return success message', async () => {
      const expectedResponse = {
        success: true,
        message: 'Quote has been declined. Thank you for letting us know.',
      };
      quoteService.declineQuoteByToken.mockResolvedValue(expectedResponse);

      const result = await controller.declineQuote(mockViewToken, declineDto);

      expect(result).toEqual(expectedResponse);
      expect(quoteService.declineQuoteByToken).toHaveBeenCalledWith(
        mockViewToken,
        declineDto.reason,
      );
    });

    it('should decline quote without reason', async () => {
      const emptyDeclineDto: DeclineQuoteDto = {};
      const expectedResponse = {
        success: true,
        message: 'Quote has been declined. Thank you for letting us know.',
      };
      quoteService.declineQuoteByToken.mockResolvedValue(expectedResponse);

      const result = await controller.declineQuote(
        mockViewToken,
        emptyDeclineDto,
      );

      expect(result).toEqual(expectedResponse);
      expect(quoteService.declineQuoteByToken).toHaveBeenCalledWith(
        mockViewToken,
        undefined,
      );
    });

    it('should throw NotFoundException for invalid token', async () => {
      quoteService.declineQuoteByToken.mockRejectedValue(
        new NotFoundException('Quote not found or link expired'),
      );

      await expect(
        controller.declineQuote(mockViewToken, declineDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for already declined quote', async () => {
      quoteService.declineQuoteByToken.mockRejectedValue(
        new BadRequestException('Cannot decline quote with status DECLINED'),
      );

      await expect(
        controller.declineQuote(mockViewToken, declineDto),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
