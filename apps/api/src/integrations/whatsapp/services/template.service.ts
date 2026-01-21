/**
 * WhatsApp Template Management Service
 * TASK-WA-002: WhatsApp Template Management Service
 *
 * Manages WhatsApp message templates:
 * - Template validation and parameter checking
 * - Building template components for Meta Cloud API
 * - Opt-in compliance verification
 * - Template usage tracking
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  WhatsAppTemplateName,
  TemplateComponent,
} from '../types/whatsapp.types';
import {
  TemplateDefinition,
  TemplateParameterValues,
  BuiltTemplate,
  TemplateValidationResult,
  TemplateUsageContext,
  CRECHEBOOKS_TEMPLATES,
  getTemplateDefinition,
  templateRequiresOptIn,
  DocumentParam,
  ImageParam,
} from '../types/template.types';

@Injectable()
export class WhatsAppTemplateService {
  private readonly logger = new Logger(WhatsAppTemplateService.name);

  /**
   * Get all available template names
   */
  getAvailableTemplates(): WhatsAppTemplateName[] {
    return Object.keys(CRECHEBOOKS_TEMPLATES) as WhatsAppTemplateName[];
  }

  /**
   * Get template definition by name
   */
  getTemplate(name: WhatsAppTemplateName): TemplateDefinition | undefined {
    return getTemplateDefinition(name);
  }

  /**
   * Validate template parameters before sending
   */
  validateParameters(
    templateName: WhatsAppTemplateName,
    params: TemplateParameterValues,
  ): TemplateValidationResult {
    const result: TemplateValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
    };

    const template = this.getTemplate(templateName);
    if (!template) {
      result.valid = false;
      result.errors.push(`Template '${templateName}' not found`);
      return result;
    }

    // Validate body parameters
    for (const paramDef of template.body.parameters) {
      const value = params[paramDef.name];

      if (
        paramDef.required &&
        (value === undefined || value === null || value === '')
      ) {
        result.valid = false;
        result.errors.push(`Required parameter '${paramDef.name}' is missing`);
        continue;
      }

      if (value !== undefined && value !== null) {
        // Type-specific validation
        if (paramDef.type === 'text' && typeof value === 'string') {
          if (paramDef.maxLength && value.length > paramDef.maxLength) {
            result.valid = false;
            result.errors.push(
              `Parameter '${paramDef.name}' exceeds max length of ${paramDef.maxLength}`,
            );
          }
        }

        if (paramDef.type === 'currency' && typeof value === 'string') {
          // Validate currency format (e.g., R1,500.00)
          if (!/^R?\s?\d{1,3}(,\d{3})*(\.\d{2})?$/.test(value)) {
            result.warnings.push(
              `Parameter '${paramDef.name}' may not be in correct currency format`,
            );
          }
        }

        if (paramDef.type === 'document') {
          const docValue = value as DocumentParam;
          if (!docValue.link || !docValue.filename) {
            result.valid = false;
            result.errors.push(
              `Document parameter '${paramDef.name}' requires link and filename`,
            );
          }
        }

        if (paramDef.type === 'image') {
          const imgValue = value as ImageParam;
          if (!imgValue.link) {
            result.valid = false;
            result.errors.push(
              `Image parameter '${paramDef.name}' requires link`,
            );
          }
        }
      }
    }

    // Validate header parameters if present
    if (template.header?.parameters) {
      for (const paramDef of template.header.parameters) {
        const value = params[paramDef.name];
        if (paramDef.required && !value) {
          result.valid = false;
          result.errors.push(
            `Required header parameter '${paramDef.name}' is missing`,
          );
        }
      }
    }

    return result;
  }

  /**
   * Check if template requires opt-in and if user has opted in
   */
  checkOptInCompliance(
    templateName: WhatsAppTemplateName,
    hasOptedIn: boolean,
  ): { allowed: boolean; reason?: string } {
    const requiresOptIn = templateRequiresOptIn(templateName);

    if (requiresOptIn && !hasOptedIn) {
      return {
        allowed: false,
        reason: `Template '${templateName}' requires WhatsApp opt-in consent`,
      };
    }

    return { allowed: true };
  }

  /**
   * Build template components for Meta Cloud API
   */
  buildTemplate(
    templateName: WhatsAppTemplateName,
    params: TemplateParameterValues,
  ): BuiltTemplate | null {
    const template = this.getTemplate(templateName);
    if (!template) {
      this.logger.error(`Template '${templateName}' not found`);
      return null;
    }

    const components: TemplateComponent[] = [];

    // Build header component if present
    if (template.header && template.header.type !== 'none') {
      const headerComponent = this.buildHeaderComponent(template, params);
      if (headerComponent) {
        components.push(headerComponent);
      }
    }

    // Build body component
    const bodyComponent = this.buildBodyComponent(template, params);
    components.push(bodyComponent);

    // Build button components if present
    if (template.buttons && template.buttons.length > 0) {
      const buttonComponents = this.buildButtonComponents(template, params);
      components.push(...buttonComponents);
    }

    return {
      name: templateName,
      language: { code: template.language },
      components,
    };
  }

  /**
   * Build header component based on template definition
   */
  private buildHeaderComponent(
    template: TemplateDefinition,
    params: TemplateParameterValues,
  ): TemplateComponent | null {
    if (!template.header || template.header.type === 'none') {
      return null;
    }

    const headerComponent: TemplateComponent = {
      type: 'header',
      parameters: [],
    };

    switch (template.header.type) {
      case 'document': {
        const docParam = template.header.parameters?.find(
          (p) => p.type === 'document',
        );
        if (docParam) {
          const docValue = params[docParam.name] as DocumentParam;
          if (docValue) {
            headerComponent.parameters = [
              {
                type: 'document',
                document: {
                  link: docValue.link,
                  filename: docValue.filename,
                },
              },
            ];
          }
        }
        break;
      }
      case 'image': {
        const imgParam = template.header.parameters?.find(
          (p) => p.type === 'image',
        );
        if (imgParam) {
          const imgValue = params[imgParam.name] as ImageParam;
          if (imgValue) {
            headerComponent.parameters = [
              {
                type: 'image',
                image: {
                  link: imgValue.link,
                },
              },
            ];
          }
        }
        break;
      }
      case 'text': {
        if (template.header.parameters) {
          headerComponent.parameters = template.header.parameters.map(
            (paramDef) => ({
              type: 'text' as const,
              text: String(params[paramDef.name] ?? ''),
            }),
          );
        }
        break;
      }
    }

    return headerComponent;
  }

  /**
   * Build body component with parameters
   */
  private buildBodyComponent(
    template: TemplateDefinition,
    params: TemplateParameterValues,
  ): TemplateComponent {
    const parameters = template.body.parameters.map((paramDef) => {
      const value = params[paramDef.name];
      let textValue: string;

      if (value instanceof Date) {
        // Format date according to template format
        textValue = this.formatDate(value, paramDef.format);
      } else if (typeof value === 'number') {
        textValue = String(value);
      } else if (typeof value === 'string') {
        textValue = value;
      } else {
        textValue = '';
      }

      return {
        type: 'text' as const,
        text: textValue,
      };
    });

    return {
      type: 'body',
      parameters,
    };
  }

  /**
   * Build button components
   */
  private buildButtonComponents(
    template: TemplateDefinition,
    params: TemplateParameterValues,
  ): TemplateComponent[] {
    if (!template.buttons) return [];

    return template.buttons
      .filter((btn) => btn.type === 'url' && btn.url?.includes('{{'))
      .map((btn, index) => {
        // Extract parameter placeholder from URL (e.g., {{1}})
        const match = btn.url?.match(/\{\{(\d+)\}\}/);
        let urlParam = '';

        if (match) {
          // Find the corresponding parameter value
          // Button URLs typically use contextId or similar
          const paramName = Object.keys(params).find(
            (k) =>
              k.toLowerCase().includes('id') ||
              k.toLowerCase().includes('number'),
          );
          if (paramName) {
            urlParam = String(params[paramName]);
          }
        }

        return {
          type: 'button' as const,
          sub_type: 'url' as const,
          index: String(index),
          parameters: [
            {
              type: 'text' as const,
              text: urlParam,
            },
          ],
        };
      });
  }

  /**
   * Format date according to template format specification
   */
  private formatDate(date: Date, format?: string): string {
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];

    const day = date.getDate().toString().padStart(2, '0');
    const month = months[date.getMonth()];
    const year = date.getFullYear();

    // Default format: DD MMM YYYY
    if (!format || format === 'DD MMM YYYY') {
      return `${day} ${month} ${year}`;
    }

    return date.toLocaleDateString('en-ZA');
  }

  /**
   * Get template compliance information
   */
  getComplianceInfo(templateName: WhatsAppTemplateName): {
    requiresOptIn: boolean;
    dataRetentionDays: number;
    purpose: string;
  } | null {
    const template = this.getTemplate(templateName);
    if (!template) return null;

    return {
      requiresOptIn: template.compliance.requiresOptIn,
      dataRetentionDays: template.compliance.dataRetentionDays,
      purpose: template.compliance.purpose,
    };
  }

  /**
   * Build invoice notification template with all required parameters
   */
  buildInvoiceNotification(data: {
    parentName: string;
    invoiceNumber: string;
    childName: string;
    amount: string;
    dueDate: Date | string;
    documentLink?: string;
    documentFilename?: string;
  }): BuiltTemplate | null {
    const params: TemplateParameterValues = {
      parentName: data.parentName,
      invoiceNumber: data.invoiceNumber,
      childName: data.childName,
      amount: data.amount,
      dueDate:
        data.dueDate instanceof Date ? data.dueDate : new Date(data.dueDate),
    };

    if (data.documentLink && data.documentFilename) {
      params.document = {
        link: data.documentLink,
        filename: data.documentFilename,
      };
    }

    return this.buildTemplate('invoice_notification', params);
  }

  /**
   * Build payment reminder template
   */
  buildPaymentReminder(data: {
    parentName: string;
    invoiceNumber: string;
    amount: string;
    daysOverdue: number;
    amountDue: string;
    dueDate: Date | string;
  }): BuiltTemplate | null {
    const params: TemplateParameterValues = {
      parentName: data.parentName,
      invoiceNumber: data.invoiceNumber,
      amount: data.amount,
      daysOverdue: `${data.daysOverdue} days`,
      amountDue: data.amountDue,
      dueDate:
        data.dueDate instanceof Date ? data.dueDate : new Date(data.dueDate),
    };

    return this.buildTemplate('invoice_reminder', params);
  }

  /**
   * Build payment received confirmation template
   */
  buildPaymentReceived(data: {
    parentName: string;
    amount: string;
    invoiceNumber: string;
    reference: string;
    paymentDate: Date | string;
    balance: string;
  }): BuiltTemplate | null {
    const params: TemplateParameterValues = {
      parentName: data.parentName,
      amount: data.amount,
      invoiceNumber: data.invoiceNumber,
      reference: data.reference,
      paymentDate:
        data.paymentDate instanceof Date
          ? data.paymentDate
          : new Date(data.paymentDate),
      balance: data.balance,
    };

    return this.buildTemplate('payment_received', params);
  }

  /**
   * Build arrears notice template
   */
  buildArrearsNotice(data: {
    parentName: string;
    daysInArrears: number;
    totalOutstanding: string;
    oldestInvoice: string;
  }): BuiltTemplate | null {
    const params: TemplateParameterValues = {
      parentName: data.parentName,
      daysInArrears: String(data.daysInArrears),
      totalOutstanding: data.totalOutstanding,
      oldestInvoice: data.oldestInvoice,
    };

    return this.buildTemplate('arrears_notice', params);
  }

  /**
   * Build welcome message template
   */
  buildWelcomeMessage(data: {
    crecheName: string;
    parentName: string;
    childName: string;
  }): BuiltTemplate | null {
    const params: TemplateParameterValues = {
      crecheName: data.crecheName,
      parentName: data.parentName,
      childName: data.childName,
    };

    return this.buildTemplate('registration_welcome', params);
  }

  /**
   * Build statement notification template
   * TASK-WA-003: Statement Delivery via WhatsApp
   */
  buildStatementNotification(data: {
    parentName: string;
    periodStart: Date | string;
    periodEnd: Date | string;
    openingBalance: string;
    charges: string;
    payments: string;
    closingBalance: string;
    documentLink?: string;
    documentFilename?: string;
    statementId?: string;
  }): BuiltTemplate | null {
    const params: TemplateParameterValues = {
      parentName: data.parentName,
      periodStart:
        data.periodStart instanceof Date
          ? data.periodStart
          : new Date(data.periodStart),
      periodEnd:
        data.periodEnd instanceof Date
          ? data.periodEnd
          : new Date(data.periodEnd),
      openingBalance: data.openingBalance,
      charges: data.charges,
      payments: data.payments,
      closingBalance: data.closingBalance,
    };

    if (data.documentLink && data.documentFilename) {
      params.document = {
        link: data.documentLink,
        filename: data.documentFilename,
      };
    }

    // Include statement ID for URL button
    if (data.statementId) {
      params.statementId = data.statementId;
    }

    return this.buildTemplate('statement_notification', params);
  }

  /**
   * Log template usage for audit
   */
  logTemplateUsage(
    templateName: WhatsAppTemplateName,
    context: TemplateUsageContext,
  ): void {
    this.logger.log({
      message: 'WhatsApp template used',
      template: templateName,
      tenantId: context.tenantId,
      parentId: context.parentId,
      contextType: context.contextType,
      contextId: context.contextId,
      recipientPhone: context.recipientPhone.replace(/\d(?=\d{4})/g, '*'), // Mask phone for logs
      timestamp: new Date().toISOString(),
    });
  }
}
