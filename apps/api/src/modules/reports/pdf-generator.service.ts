/**
 * PDF Generator Service
 * TASK-REPORTS-003: Enhanced PDF Generation with AI Insights
 *
 * @module modules/reports/pdf-generator.service
 * @description Service for generating PDF reports with AI insights section.
 *
 * CRITICAL RULES:
 * - NO WORKAROUNDS OR FALLBACKS that silently fail
 * - All amounts are CENTS (integers)
 * - Currency format: R X,XXX.XX (ZAR)
 * - Date format: dd/MM/yyyy (SA format)
 */

import { Injectable, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import type {
  AIInsights,
  KeyFinding,
  TrendAnalysis,
  AnomalyDetection,
  Recommendation,
} from '../../agents/report-synthesis/interfaces/synthesis.interface';
import type { ReportDataResponseDto } from './dto/report-data.dto';

/**
 * Color palette for PDF styling.
 */
const COLORS = {
  header: '#1a365d',
  positive: '#38a169',
  negative: '#e53e3e',
  neutral: '#718096',
  text: '#2d3748',
  textSecondary: '#4a5568',
  background: '#f7fafc',
  warning: '#dd6b20',
  border: '#e2e8f0',
} as const;

/**
 * Font sizes for consistent styling.
 */
const FONT_SIZES = {
  title: 20,
  subtitle: 16,
  sectionHeader: 14,
  subSectionHeader: 12,
  body: 10,
  small: 9,
  tiny: 8,
} as const;

/**
 * PDF Generator Service for creating enhanced reports with AI insights.
 */
@Injectable()
export class PdfGeneratorService {
  private readonly logger = new Logger(PdfGeneratorService.name);

  /**
   * Generate a PDF report with optional AI insights section.
   *
   * @param reportData - Report data from ReportsService
   * @param aiInsights - AI-generated insights (null if not available)
   * @param tenantName - Name of the tenant for branding
   * @returns Buffer containing the PDF document
   */
  async generateReportPdf(
    reportData: ReportDataResponseDto,
    aiInsights: AIInsights | null,
    tenantName: string,
  ): Promise<Buffer> {
    this.logger.log(
      `Generating PDF report for tenant: ${tenantName}, type: ${reportData.type}, includeInsights: ${aiInsights !== null}`,
    );

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        margin: 50,
        size: 'A4',
        bufferPages: true,
      });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const buffer = Buffer.concat(buffers);
        this.logger.log(`PDF generated successfully: ${buffer.length} bytes`);
        resolve(buffer);
      });
      doc.on('error', (error: Error) => {
        this.logger.error(
          `PDF generation failed: ${error.message}`,
          error.stack,
        );
        reject(error);
      });

      try {
        // Render header
        this.renderHeader(doc, reportData, tenantName);

        // Render financial data section
        this.renderFinancialData(doc, reportData);

        // Render AI insights section if available
        if (aiInsights) {
          this.renderAIInsights(doc, aiInsights);
        }

        // Render footer on all pages
        this.renderFooter(doc, tenantName);

        doc.end();
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to render PDF: ${errorMessage}`);
        reject(new Error(`PDF rendering failed: ${errorMessage}`));
      }
    });
  }

  /**
   * Render the report header with tenant name and period information.
   */
  private renderHeader(
    doc: PDFKit.PDFDocument,
    reportData: ReportDataResponseDto,
    tenantName: string,
  ): void {
    // Tenant name
    doc
      .fontSize(FONT_SIZES.title)
      .fillColor(COLORS.header)
      .text(tenantName, { align: 'center' });

    doc.moveDown(0.3);

    // Report type title
    const reportTitle = this.formatReportType(reportData.type);
    doc
      .fontSize(FONT_SIZES.subtitle)
      .fillColor(COLORS.text)
      .text(reportTitle, { align: 'center' });

    doc.moveDown(0.3);

    // Period
    const periodStart = this.formatDate(new Date(reportData.period.start));
    const periodEnd = this.formatDate(new Date(reportData.period.end));
    doc
      .fontSize(FONT_SIZES.body)
      .fillColor(COLORS.neutral)
      .text(`Period: ${periodStart} - ${periodEnd}`, { align: 'center' });

    doc.moveDown(2);
  }

  /**
   * Render the financial data section.
   */
  private renderFinancialData(
    doc: PDFKit.PDFDocument,
    reportData: ReportDataResponseDto,
  ): void {
    // Render each section (Income, Expenses, etc.)
    for (const section of reportData.sections) {
      this.renderSection(doc, section);
    }

    // Render summary totals
    this.renderSummary(doc, reportData);
  }

  /**
   * Render a single report section.
   */
  private renderSection(
    doc: PDFKit.PDFDocument,
    section: ReportDataResponseDto['sections'][0],
  ): void {
    const isExpense = section.title.toLowerCase().includes('expense');

    // Section header
    doc
      .fontSize(FONT_SIZES.sectionHeader)
      .fillColor(COLORS.header)
      .text(section.title.toUpperCase(), { underline: true });
    doc.moveDown(0.5);

    // Check if there are breakdown items
    if (section.breakdown.length === 0) {
      doc
        .fontSize(FONT_SIZES.body)
        .fillColor(COLORS.neutral)
        .text(`  No ${section.title.toLowerCase()} recorded for this period`);
    } else {
      // Render each breakdown item
      for (const item of section.breakdown) {
        const amount = this.formatCurrency(item.amountCents);
        doc.fontSize(FONT_SIZES.body).fillColor(COLORS.text);
        doc.text(`  ${item.accountCode} - ${item.accountName}`, {
          continued: true,
          width: 350,
        });
        doc.text(amount, { align: 'right' });
      }
    }

    doc.moveDown(0.5);

    // Section total
    const totalColor = isExpense ? COLORS.negative : COLORS.positive;
    doc
      .fontSize(FONT_SIZES.subSectionHeader)
      .fillColor(totalColor)
      .text(`  Total ${section.title}`, { continued: true, width: 350 })
      .text(this.formatCurrency(section.totalCents), { align: 'right' });

    doc.fillColor(COLORS.text).moveDown(1.5);
  }

  /**
   * Render the summary totals.
   */
  private renderSummary(
    doc: PDFKit.PDFDocument,
    reportData: ReportDataResponseDto,
  ): void {
    const { summary } = reportData;
    const netProfitLabel =
      summary.netProfitCents >= 0 ? 'NET PROFIT' : 'NET LOSS';
    const netProfitColor =
      summary.netProfitCents >= 0 ? COLORS.positive : COLORS.negative;

    // Draw separator line
    const startX = 50;
    const endX = 545;
    doc.moveTo(startX, doc.y).lineTo(endX, doc.y).stroke(COLORS.border);
    doc.moveDown(1);

    // Net profit/loss
    doc
      .fontSize(FONT_SIZES.subtitle)
      .fillColor(netProfitColor)
      .text(netProfitLabel, { continued: true, width: 350 })
      .text(this.formatCurrency(Math.abs(summary.netProfitCents)), {
        align: 'right',
      });

    // Profit margin percentage
    doc.moveDown(0.5);
    doc
      .fontSize(FONT_SIZES.body)
      .fillColor(COLORS.neutral)
      .text(`Profit Margin: ${summary.profitMarginPercent.toFixed(1)}%`, {
        align: 'right',
      });

    doc.moveDown(2);
  }

  /**
   * Render the AI insights section.
   */
  renderAIInsights(doc: PDFKit.PDFDocument, insights: AIInsights): void {
    this.logger.debug('Rendering AI insights section');

    // Start new page for AI insights
    doc.addPage();

    // Section header with AI badge
    doc
      .fontSize(FONT_SIZES.subtitle)
      .fillColor(COLORS.header)
      .text('AI-Generated Insights', { underline: true });
    doc.moveDown(0.5);

    // Confidence indicator and source
    const sourceLabel =
      insights.source === 'SDK' ? 'Claude AI' : 'Analysis Engine';
    doc
      .fontSize(FONT_SIZES.small)
      .fillColor(COLORS.neutral)
      .text(
        `Analysis confidence: ${insights.confidenceScore}% | Source: ${sourceLabel}`,
      );
    doc.moveDown(1);

    // Executive Summary
    this.renderExecutiveSummary(doc, insights.executiveSummary);

    // Key Findings
    if (insights.keyFindings.length > 0) {
      this.renderKeyFindings(doc, insights.keyFindings);
    }

    // Trends
    if (insights.trends.length > 0) {
      this.renderTrends(doc, insights.trends);
    }

    // Anomalies
    if (insights.anomalies.length > 0) {
      this.renderAnomalies(doc, insights.anomalies);
    }

    // Recommendations
    if (insights.recommendations.length > 0) {
      this.renderRecommendations(doc, insights.recommendations);
    }
  }

  /**
   * Render the executive summary section.
   */
  private renderExecutiveSummary(
    doc: PDFKit.PDFDocument,
    summary: string,
  ): void {
    doc
      .fontSize(FONT_SIZES.subSectionHeader)
      .fillColor(COLORS.text)
      .text('Executive Summary', { underline: true });
    doc.moveDown(0.5);

    doc
      .fontSize(FONT_SIZES.body)
      .fillColor(COLORS.textSecondary)
      .text(summary, {
        align: 'justify',
        lineGap: 2,
      });
    doc.moveDown(1);
  }

  /**
   * Render the key findings section with color-coded impact indicators.
   */
  private renderKeyFindings(
    doc: PDFKit.PDFDocument,
    findings: KeyFinding[],
  ): void {
    doc
      .fontSize(FONT_SIZES.subSectionHeader)
      .fillColor(COLORS.text)
      .text('Key Findings', { underline: true });
    doc.moveDown(0.5);

    for (const finding of findings) {
      const icon = this.getImpactIcon(finding.impact);
      const color = this.getImpactColor(finding.impact);

      doc
        .fontSize(FONT_SIZES.body)
        .fillColor(color)
        .text(`${icon} [${finding.category.toUpperCase()}] ${finding.finding}`);
      doc.moveDown(0.3);
    }

    doc.moveDown(0.5);
  }

  /**
   * Render the trends section with direction arrows and percentages.
   */
  private renderTrends(doc: PDFKit.PDFDocument, trends: TrendAnalysis[]): void {
    doc
      .fontSize(FONT_SIZES.subSectionHeader)
      .fillColor(COLORS.text)
      .text('Trends Detected', { underline: true });
    doc.moveDown(0.5);

    for (const trend of trends) {
      const arrow = this.getTrendArrow(trend.direction);
      const changeColor = this.getTrendColor(trend.direction);
      const changeStr =
        trend.percentageChange >= 0
          ? `+${trend.percentageChange.toFixed(1)}%`
          : `${trend.percentageChange.toFixed(1)}%`;

      doc
        .fontSize(FONT_SIZES.body)
        .fillColor(changeColor)
        .text(`${arrow} ${trend.metric}: ${changeStr} (${trend.timeframe})`);

      if (trend.interpretation) {
        doc
          .fontSize(FONT_SIZES.small)
          .fillColor(COLORS.neutral)
          .text(`   ${trend.interpretation}`);
      }

      doc.moveDown(0.3);
    }

    doc.moveDown(0.5);
  }

  /**
   * Render the anomalies section with warning styling.
   */
  private renderAnomalies(
    doc: PDFKit.PDFDocument,
    anomalies: AnomalyDetection[],
  ): void {
    doc
      .fontSize(FONT_SIZES.subSectionHeader)
      .fillColor(COLORS.warning)
      .text('Anomalies Detected', { underline: true });
    doc.moveDown(0.5);

    for (const anomaly of anomalies) {
      const severityColor = this.getSeverityColor(anomaly.severity);

      doc
        .fontSize(FONT_SIZES.body)
        .fillColor(severityColor)
        .text(`[${anomaly.severity.toUpperCase()}] ${anomaly.description}`);

      // Show expected vs actual values
      doc
        .fontSize(FONT_SIZES.small)
        .fillColor(COLORS.neutral)
        .text(
          `   Expected: ${this.formatCurrency(anomaly.expectedValue)} | Actual: ${this.formatCurrency(anomaly.actualValue)}`,
        );

      // Show possible causes
      if (anomaly.possibleCauses.length > 0) {
        doc
          .fontSize(FONT_SIZES.small)
          .fillColor(COLORS.neutral)
          .text(`   Possible causes: ${anomaly.possibleCauses.join(', ')}`);
      }

      doc.moveDown(0.4);
    }

    doc.moveDown(0.5);
  }

  /**
   * Render the recommendations section sorted by priority.
   */
  private renderRecommendations(
    doc: PDFKit.PDFDocument,
    recommendations: Recommendation[],
  ): void {
    doc
      .fontSize(FONT_SIZES.subSectionHeader)
      .fillColor(COLORS.text)
      .text('Recommendations', { underline: true });
    doc.moveDown(0.5);

    // Sort by priority: high -> medium -> low
    const sorted = [...recommendations].sort((a, b) => {
      const priorityOrder: Record<string, number> = {
        high: 0,
        medium: 1,
        low: 2,
      };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    for (let i = 0; i < sorted.length; i++) {
      const rec = sorted[i];
      const priorityColor = this.getPriorityColor(rec.priority);

      doc
        .fontSize(FONT_SIZES.body)
        .fillColor(priorityColor)
        .text(`${i + 1}. [${rec.priority.toUpperCase()}] ${rec.action}`);

      doc
        .fontSize(FONT_SIZES.small)
        .fillColor(COLORS.neutral)
        .text(
          `   Expected impact: ${rec.expectedImpact} | Timeline: ${rec.timeline}`,
        );

      doc.moveDown(0.3);
    }
  }

  /**
   * Render the footer on all pages.
   */
  private renderFooter(doc: PDFKit.PDFDocument, tenantName: string): void {
    const pages = doc.bufferedPageRange();

    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);

      // Save current position
      const bottomMargin = 50;
      const pageHeight = doc.page.height;
      const footerY = pageHeight - bottomMargin;

      // Generated timestamp
      doc
        .fontSize(FONT_SIZES.tiny)
        .fillColor(COLORS.neutral)
        .text(
          `Generated: ${this.formatDateTime(new Date())}`,
          50,
          footerY - 20,
          { align: 'center', width: 495 },
        );

      // Branding
      doc
        .fontSize(FONT_SIZES.tiny)
        .fillColor(COLORS.neutral)
        .text(
          `${tenantName} - CrecheBooks Financial Report`,
          50,
          footerY - 10,
          {
            align: 'center',
            width: 495,
          },
        );

      // Page number
      doc
        .fontSize(FONT_SIZES.tiny)
        .fillColor(COLORS.neutral)
        .text(`Page ${i + 1} of ${pages.count}`, 50, footerY, {
          align: 'center',
          width: 495,
        });
    }
  }

  // ========================================
  // Helper methods
  // ========================================

  /**
   * Format report type for display.
   */
  private formatReportType(type: string): string {
    const typeMap: Record<string, string> = {
      INCOME_STATEMENT: 'Income Statement',
      BALANCE_SHEET: 'Balance Sheet',
      CASH_FLOW: 'Cash Flow Statement',
      VAT_REPORT: 'VAT Report',
      AGED_RECEIVABLES: 'Aged Receivables',
      AGED_PAYABLES: 'Aged Payables',
    };
    return typeMap[type] || type;
  }

  /**
   * Format date as DD/MM/YYYY (South African format).
   */
  private formatDate(date: Date): string {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }

  /**
   * Format date and time.
   */
  private formatDateTime(date: Date): string {
    const dateStr = this.formatDate(date);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${dateStr} ${hours}:${minutes}`;
  }

  /**
   * Format currency in ZAR (R X,XXX.XX).
   */
  private formatCurrency(cents: number): string {
    const rands = cents / 100;
    const formatted = rands.toLocaleString('en-ZA', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `R ${formatted}`;
  }

  /**
   * Get icon for finding impact.
   */
  private getImpactIcon(impact: string): string {
    switch (impact) {
      case 'positive':
        return '\u2713'; // Checkmark
      case 'negative':
        return '\u26A0'; // Warning
      default:
        return '\u2022'; // Bullet
    }
  }

  /**
   * Get color for finding impact.
   */
  private getImpactColor(impact: string): string {
    switch (impact) {
      case 'positive':
        return COLORS.positive;
      case 'negative':
        return COLORS.negative;
      default:
        return COLORS.neutral;
    }
  }

  /**
   * Get arrow for trend direction.
   */
  private getTrendArrow(direction: string): string {
    switch (direction) {
      case 'increasing':
        return '\u2197'; // North-east arrow
      case 'decreasing':
        return '\u2198'; // South-east arrow
      case 'stable':
        return '\u2192'; // Right arrow
      default:
        return '\u2194'; // Left-right arrow (volatile)
    }
  }

  /**
   * Get color for trend direction.
   */
  private getTrendColor(direction: string): string {
    switch (direction) {
      case 'increasing':
        return COLORS.positive;
      case 'decreasing':
        return COLORS.negative;
      default:
        return COLORS.neutral;
    }
  }

  /**
   * Get color for severity level.
   */
  private getSeverityColor(severity: string): string {
    switch (severity) {
      case 'critical':
        return COLORS.negative;
      case 'high':
        return COLORS.warning;
      case 'medium':
        return COLORS.warning;
      default:
        return COLORS.neutral;
    }
  }

  /**
   * Get color for recommendation priority.
   */
  private getPriorityColor(priority: string): string {
    switch (priority) {
      case 'high':
        return COLORS.negative;
      case 'medium':
        return COLORS.warning;
      default:
        return COLORS.neutral;
    }
  }
}
