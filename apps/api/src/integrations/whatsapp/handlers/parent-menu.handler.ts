/**
 * Parent Menu Handler
 * TASK-WA-022: WhatsApp Self-Service Menu for Parents
 *
 * Routes incoming WhatsApp messages from known parents to the existing
 * interactive infrastructure (SessionInteractiveHandler, ButtonResponseHandler).
 *
 * Entry point: handleIncomingMessage(waId, tenantId, body, buttonPayload?, listId?)
 *
 * Routing priority:
 * 1. Opt-out keywords (STOP, unsubscribe) → toggle whatsappOptIn
 * 2. Opt-in keywords (START, optin) → toggle whatsappOptIn + send menu
 * 3. ButtonPayload present → parse and dispatch to appropriate handler
 * 4. ListId present → parse and dispatch to appropriate handler
 * 5. Text message → keyword match or send main menu
 *
 * IMPORTANT: All messages use tenant.tradingName for branding, NOT "CrecheBooks"
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { TwilioContentService } from '../services/twilio-content.service';
import { SessionInteractiveHandler } from './session-interactive.handler';
import { ButtonResponseHandler } from './button-response.handler';
import {
  parseMenuAction,
  parseListResponse,
  createListId,
} from '../types/session.types';

/** Keywords that trigger opt-out */
const OPT_OUT_KEYWORDS = ['stop', 'unsubscribe', 'cancel', 'quit'];

/** Keywords that trigger opt-in */
const OPT_IN_KEYWORDS = ['start', 'optin', 'opt-in', 'subscribe'];

/** Greeting keywords → show main menu */
const GREETING_KEYWORDS = ['hi', 'hello', 'hey', 'menu', 'help'];

/** Balance keywords */
const BALANCE_KEYWORDS = ['balance', 'owe', 'owing', 'account'];

/** Invoice keywords */
const INVOICE_KEYWORDS = ['invoice', 'invoices', 'bill', 'bills'];

/** Statement keywords */
const STATEMENT_KEYWORDS = ['statement', 'statements'];

/** Payment keywords */
const PAYMENT_KEYWORDS = ['pay', 'payment', 'eft', 'bank'];

/** Human-assistance keywords */
const HUMAN_KEYWORDS = ['speak', 'call', 'human', 'person', 'agent'];

@Injectable()
export class ParentMenuHandler {
  private readonly logger = new Logger(ParentMenuHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contentService: TwilioContentService,
    private readonly sessionHandler: SessionInteractiveHandler,
    private readonly buttonHandler: ButtonResponseHandler,
  ) {}

  /**
   * Main entry point for incoming WhatsApp messages from parents
   *
   * @param waId - WhatsApp ID (phone number without + prefix)
   * @param tenantId - Tenant ID
   * @param body - Message body text
   * @param buttonPayload - Twilio ButtonPayload field (button tap responses)
   * @param listId - Twilio ListId field (list picker selections)
   */
  async handleIncomingMessage(
    waId: string,
    tenantId: string,
    body: string,
    buttonPayload?: string,
    listId?: string,
  ): Promise<void> {
    const to = waId.startsWith('+') ? waId : `+${waId}`;

    // 1. Resolve parent
    const parent = await this.resolveParent(waId, tenantId);

    if (!parent) {
      this.logger.debug(`Unknown parent ${waId} for tenant ${tenantId}`);
      await this.contentService.sendSessionMessage(
        to,
        `Hi there! We don't have your number on file. If you'd like to register your child, reply with "register".`,
        tenantId,
      );
      return;
    }

    const lower = body.toLowerCase().trim();

    // 2. Opt-out
    if (OPT_OUT_KEYWORDS.includes(lower)) {
      await this.handleOptOut(parent.id, to, tenantId);
      return;
    }

    // 3. Opt-in
    if (OPT_IN_KEYWORDS.includes(lower)) {
      await this.handleOptIn(parent.id, to, tenantId);
      return;
    }

    // 4. ButtonPayload present (button tap from quick reply)
    if (buttonPayload) {
      await this.handleButtonPayload(buttonPayload, to, tenantId, parent.id);
      return;
    }

    // 5. ListId present (list picker selection)
    if (listId) {
      await this.handleListId(listId, to, tenantId, parent.id);
      return;
    }

    // 6. Text message — keyword routing
    await this.handleTextMessage(lower, to, tenantId, parent.id);
  }

  /**
   * Resolve parent record from waId + tenantId
   */
  private async resolveParent(
    waId: string,
    tenantId: string,
  ): Promise<{ id: string } | null> {
    return this.prisma.parent.findFirst({
      where: {
        tenantId,
        OR: [
          { whatsapp: waId },
          { phone: waId },
          { whatsapp: `+${waId}` },
          { phone: `+${waId}` },
        ],
      },
      select: { id: true },
    });
  }

  /**
   * Handle opt-out: set whatsappOptIn = false
   */
  private async handleOptOut(
    parentId: string,
    to: string,
    tenantId: string,
  ): Promise<void> {
    await this.prisma.parent.update({
      where: { id: parentId },
      data: { whatsappOptIn: false },
    });

    await this.contentService.sendSessionMessage(
      to,
      `You've been unsubscribed from WhatsApp messages. Reply "START" at any time to re-subscribe.`,
      tenantId,
    );

    this.logger.log(`Parent ${parentId} opted out of WhatsApp`);
  }

  /**
   * Handle opt-in: set whatsappOptIn = true, send main menu
   */
  private async handleOptIn(
    parentId: string,
    to: string,
    tenantId: string,
  ): Promise<void> {
    await this.prisma.parent.update({
      where: { id: parentId },
      data: { whatsappOptIn: true },
    });

    this.logger.log(`Parent ${parentId} opted in to WhatsApp`);
    await this.sendMainMenu(to, tenantId);
  }

  /**
   * Handle ButtonPayload from Twilio (quick reply button taps)
   */
  private async handleButtonPayload(
    payload: string,
    to: string,
    tenantId: string,
    parentId: string,
  ): Promise<void> {
    // Check if it's a menu_* action first
    const menuAction = parseMenuAction(payload);
    if (menuAction) {
      await this.dispatchMenuAction(menuAction, to, tenantId, parentId);
      return;
    }

    // Otherwise delegate to ButtonResponseHandler (pay_, view_, extension_, etc.)
    await this.buttonHandler.handleButtonResponse(to, payload, tenantId);
  }

  /**
   * Handle ListId from Twilio (list picker selections)
   */
  private async handleListId(
    listId: string,
    to: string,
    tenantId: string,
    parentId: string,
  ): Promise<void> {
    const result = parseListResponse(listId);

    if (!result.success || !result.parsed) {
      this.logger.warn(`Failed to parse list ID: ${listId} — ${result.error}`);
      await this.sendMainMenu(to, tenantId);
      return;
    }

    const { type, value } = result.parsed;

    switch (type) {
      case 'help':
        // 'invoices' is a main-menu item, not a standard help option
        if (value === 'invoices') {
          await this.sessionHandler.sendInvoiceList(to, tenantId, parentId);
        } else {
          await this.sessionHandler.handleHelpSelection(
            to,
            value,
            tenantId,
            parentId,
          );
        }
        break;

      case 'statement':
        await this.sessionHandler.handleStatementSelection(
          to,
          value,
          tenantId,
          parentId,
        );
        break;

      case 'invoice':
        if (value === 'list') {
          await this.sessionHandler.sendInvoiceList(to, tenantId, parentId);
        } else {
          // Specific invoice selected — delegate as view_<invoiceId>
          await this.buttonHandler.handleButtonResponse(
            to,
            `view_${value}`,
            tenantId,
          );
        }
        break;
    }
  }

  /**
   * Dispatch a parsed menu action to the appropriate handler
   */
  private async dispatchMenuAction(
    action: string,
    to: string,
    tenantId: string,
    parentId: string,
  ): Promise<void> {
    switch (action) {
      case 'pay':
      case 'payment':
        await this.sessionHandler.sendPaymentMethods(to, tenantId);
        break;
      case 'invoices':
        await this.sessionHandler.sendInvoiceList(to, tenantId, parentId);
        break;
      case 'statement':
        await this.sessionHandler.sendStatementPeriodSelector(to, tenantId);
        break;
      case 'balance':
        await this.sessionHandler.sendBalanceInfo(to, tenantId, parentId);
        break;
      case 'human':
        await this.sessionHandler.requestHumanCallback(
          to,
          tenantId,
          parentId,
        );
        break;
      case 'update':
        await this.sessionHandler.sendUpdateDetailsLink(to, tenantId);
        break;
      default:
        await this.sendMainMenu(to, tenantId);
    }
  }

  /**
   * Route text message by keyword matching
   */
  private async handleTextMessage(
    lower: string,
    to: string,
    tenantId: string,
    parentId: string,
  ): Promise<void> {
    // Check keyword sets in priority order
    if (BALANCE_KEYWORDS.some((kw) => lower.includes(kw))) {
      await this.sessionHandler.sendBalanceInfo(to, tenantId, parentId);
      return;
    }

    if (INVOICE_KEYWORDS.some((kw) => lower.includes(kw))) {
      await this.sessionHandler.sendInvoiceList(to, tenantId, parentId);
      return;
    }

    if (STATEMENT_KEYWORDS.some((kw) => lower.includes(kw))) {
      await this.sessionHandler.sendStatementPeriodSelector(to, tenantId);
      return;
    }

    if (PAYMENT_KEYWORDS.some((kw) => lower.includes(kw))) {
      await this.sessionHandler.sendPaymentMethods(to, tenantId);
      return;
    }

    if (HUMAN_KEYWORDS.some((kw) => lower.includes(kw))) {
      await this.sessionHandler.requestHumanCallback(to, tenantId, parentId);
      return;
    }

    if (GREETING_KEYWORDS.some((kw) => lower.includes(kw))) {
      await this.sendMainMenu(to, tenantId);
      return;
    }

    // No keyword match — send main menu as fallback
    await this.sendMainMenu(to, tenantId);
  }

  /**
   * Send the main self-service menu (list picker, 6 items)
   * Session message — no Meta template approval needed
   */
  private async sendMainMenu(to: string, tenantId: string): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      this.logger.error(`Tenant not found: ${tenantId}`);
      return;
    }

    const tenantName = tenant.tradingName || tenant.name;

    await this.contentService.sendListPicker(
      to,
      `Hi! Welcome to ${tenantName}. How can we help you today?`,
      'Main Menu',
      [
        {
          item: 'Check My Balance',
          id: createListId('help', 'balance'),
          description: 'Outstanding amount',
        },
        {
          item: 'My Invoices',
          id: createListId('help', 'invoices'),
          description: 'View & download invoices',
        },
        {
          item: 'Make a Payment',
          id: createListId('help', 'payment'),
          description: 'Bank details & how to pay',
        },
        {
          item: 'Get a Statement',
          id: createListId('help', 'statement'),
          description: 'Download account statement',
        },
        {
          item: 'Update My Details',
          id: createListId('help', 'update'),
          description: 'Change contact info',
        },
        {
          item: 'Speak to Someone',
          id: createListId('help', 'human'),
          description: 'Request a callback',
        },
      ],
      tenantId,
    );

    this.logger.debug(`Main menu sent to ${to}`);
  }
}
