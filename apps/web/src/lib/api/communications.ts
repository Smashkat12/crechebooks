/**
 * Communications API Client
 * TASK-COMM-004: Frontend Communication Dashboard
 */

import { apiClient } from './client';
import { endpoints } from './endpoints';

// Types
export interface BroadcastMessage {
  id: string;
  subject?: string;
  body: string;
  recipient_type: 'parent' | 'staff' | 'custom';
  channel: 'email' | 'whatsapp' | 'sms' | 'all';
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'cancelled' | 'failed';
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  scheduled_at?: string;
  sent_at?: string;
  created_at: string;
}

export interface BroadcastDetail extends BroadcastMessage {
  html_body?: string;
  recipient_filter?: RecipientFilter;
  recipient_group_id?: string;
  delivery_stats?: DeliveryStats;
}

export interface DeliveryStats {
  total: number;
  email_sent?: number;
  email_delivered?: number;
  email_opened?: number;
  email_failed?: number;
  whatsapp_sent?: number;
  whatsapp_delivered?: number;
  whatsapp_read?: number;
  whatsapp_failed?: number;
  sms_sent?: number;
  sms_delivered?: number;
  sms_failed?: number;
}

export interface RecipientFilter {
  parent_filter?: {
    is_active?: boolean;
    enrollment_status?: string[];
    fee_structure_id?: string;
    has_outstanding_balance?: boolean;
    days_overdue?: number;
  };
  staff_filter?: {
    is_active?: boolean;
    employment_type?: string[];
    department?: string;
  };
  selected_ids?: string[];
}

export interface RecipientPreview {
  total: number;
  recipients: Array<{
    id: string;
    name: string;
    email?: string;
    phone?: string;
  }>;
  has_more: boolean;
}

export interface RecipientGroup {
  id: string;
  name: string;
  description?: string;
  recipient_type: 'parent' | 'staff' | 'custom';
  filter_criteria: RecipientFilter;
  is_system: boolean;
  created_at: string;
}

export interface CreateBroadcastDto {
  subject?: string;
  body: string;
  html_body?: string;
  recipient_type: 'parent' | 'staff' | 'custom';
  recipient_filter?: RecipientFilter;
  recipient_group_id?: string;
  channel: 'email' | 'whatsapp' | 'sms' | 'all';
  scheduled_at?: string;
}

export interface BroadcastListParams {
  page?: number;
  limit?: number;
  status?: string;
  recipient_type?: string;
}

interface ApiListResponse<T> {
  success: boolean;
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
}

interface ApiSingleResponse<T> {
  success: boolean;
  data: T;
}

export const communicationsApi = {
  // Broadcasts
  createBroadcast: async (data: CreateBroadcastDto): Promise<BroadcastMessage> => {
    const response = await apiClient.post<ApiSingleResponse<BroadcastMessage>>(
      endpoints.communications.broadcasts,
      data
    );
    return response.data.data;
  },

  sendBroadcast: async (id: string): Promise<void> => {
    await apiClient.post(endpoints.communications.sendBroadcast(id));
  },

  cancelBroadcast: async (id: string): Promise<void> => {
    await apiClient.post(endpoints.communications.cancelBroadcast(id));
  },

  listBroadcasts: async (params?: BroadcastListParams): Promise<{
    broadcasts: BroadcastMessage[];
    meta: ApiListResponse<BroadcastMessage>['meta'];
  }> => {
    const response = await apiClient.get<ApiListResponse<BroadcastMessage>>(
      endpoints.communications.broadcasts,
      { params }
    );
    return {
      broadcasts: response.data.data,
      meta: response.data.meta,
    };
  },

  getBroadcast: async (id: string): Promise<BroadcastDetail> => {
    const response = await apiClient.get<ApiSingleResponse<BroadcastDetail>>(
      endpoints.communications.broadcastDetail(id)
    );
    return response.data.data;
  },

  // Recipients
  previewRecipients: async (data: {
    recipient_type: string;
    filter?: RecipientFilter;
    channel?: string;
  }): Promise<RecipientPreview> => {
    const response = await apiClient.post<ApiSingleResponse<RecipientPreview>>(
      endpoints.communications.previewRecipients,
      data
    );
    return response.data.data;
  },

  // Groups
  listGroups: async (): Promise<RecipientGroup[]> => {
    const response = await apiClient.get<ApiSingleResponse<RecipientGroup[]>>(
      endpoints.communications.groups
    );
    return response.data.data;
  },

  createGroup: async (data: {
    name: string;
    description?: string;
    recipient_type: string;
    filter_criteria: RecipientFilter;
  }): Promise<RecipientGroup> => {
    const response = await apiClient.post<ApiSingleResponse<RecipientGroup>>(
      endpoints.communications.groups,
      data
    );
    return response.data.data;
  },

  deleteGroup: async (id: string): Promise<void> => {
    await apiClient.delete(endpoints.communications.groupDetail(id));
  },
};
