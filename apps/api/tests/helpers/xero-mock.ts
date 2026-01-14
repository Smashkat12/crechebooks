/**
 * Xero MCP Mock Server
 * Simple express server that captures and responds to Xero sync requests
 */
import express, { Express, Request, Response } from 'express';
import { Server } from 'http';

interface CapturedRequest {
  method: string;
  path: string;
  body: unknown;
  timestamp: Date;
}

export class XeroMockServer {
  private app: Express;
  private server: Server | null = null;
  private requests: CapturedRequest[] = [];
  private port: number;

  constructor(port = 9999) {
    this.app = express();
    this.port = port;
    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.app.use(express.json());

    // Capture all requests using middleware (Express 5 compatible)
    this.app.use((req: Request, res: Response) => {
      this.requests.push({
        method: req.method,
        path: req.path,
        body: req.body,
        timestamp: new Date(),
      });

      // Simulate Xero API responses
      if (req.path.includes('/transactions')) {
        res.json({
          success: true,
          transactionId: `xero-tx-${Date.now()}`,
        });
      } else if (req.path.includes('/contacts')) {
        res.json({
          success: true,
          contactId: `xero-contact-${Date.now()}`,
        });
      } else {
        res.json({ success: true });
      }
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.port, () => {
          console.log(`XeroMockServer listening on port ${this.port}`);
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        // Use listening check to avoid "Server is not running" error
        if (this.server.listening) {
          this.server.close((err) => {
            if (err) {
              // Log but don't fail - server may already be stopped
              console.log(`XeroMockServer stop warning: ${err.message}`);
            }
            this.server = null;
            resolve();
          });
        } else {
          // Server exists but not listening - just clear the reference
          this.server = null;
          resolve();
        }
      } else {
        resolve();
      }
    });
  }

  getRequests(): CapturedRequest[] {
    return [...this.requests];
  }

  clearRequests(): void {
    this.requests = [];
  }

  getRequestsByPath(pathPattern: string): CapturedRequest[] {
    return this.requests.filter((r) => r.path.includes(pathPattern));
  }
}
