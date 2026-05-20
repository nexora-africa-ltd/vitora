/**
 * Inventory API client.
 *
 * Based on backend ViewSets at hmis/apps/inventory/views.py
 * and URL routes at hmis/apps/inventory/urls.py
 */

import { apiClient } from './client';
import { PaginatedResponse } from '@/lib/types';
import { parseResponse } from '@/lib/schemas/validation';
import {
  SupplierSchema,
  PaginatedSupplierSchema,
  PurchaseOrderListSchema,
  PurchaseOrderDetailSchema,
  PaginatedPurchaseOrderSchema,
  PurchaseOrderItemSchema,
  GoodsReceiptNoteListSchema,
  GoodsReceiptNoteDetailSchema,
  PaginatedGoodsReceiptNoteSchema,
  StoreLocationSchema,
  PaginatedStoreLocationSchema,
  StockTransferListSchema,
  StockTransferDetailSchema,
  PaginatedStockTransferSchema,
  TransferItemSchema,
  WardStockSchema,
  PaginatedWardStockSchema,
  WardStockTransactionSchema,
  PaginatedWardStockTransactionSchema,
  StockCountListSchema,
  StockCountDetailSchema,
  StockCountItemSchema,
  PaginatedStockCountSchema,
  PaginatedStockCountItemSchema,
  ETIMSConfigSchema,
  ETIMSInvoiceSchema,
  PaginatedETIMSInvoiceSchema,
  ConsumptionRecordSchema,
  PaginatedConsumptionRecordSchema,
  DemandForecastSchema,
  PaginatedDemandForecastSchema,
  ReorderSuggestionSchema,
  PaginatedReorderSuggestionSchema,
} from '@/lib/schemas/inventory.schema';
import type {
  Supplier,
  SupplierCreateData,
  SupplierListParams,
  PurchaseOrder,
  PurchaseOrderDetail,
  PurchaseOrderCreateData,
  PurchaseOrderListParams,
  PurchaseOrderItem,
  GoodsReceiptNote,
  GoodsReceiptNoteDetail,
  GoodsReceiptNoteCreateData,
  GoodsReceiptNoteListParams,
  StoreLocation,
  StoreLocationCreateData,
  StoreLocationListParams,
  StockTransfer,
  StockTransferDetail,
  StockTransferCreateData,
  StockTransferListParams,
  TransferItem,
  WardStock,
  WardStockCreateData,
  WardStockListParams,
  WardConsumeData,
  WardReplenishData,
  WardReturnData,
  WardStockTransaction,
  WardStockTransactionListParams,
  StockCount,
  StockCountDetail,
  StockCountItem,
  StockCountCreateData,
  StockCountListParams,
  StockCountItemUpdateData,
  ETIMSConfig,
  ETIMSConfigCreateData,
  ETIMSInvoice,
  ETIMSInvoiceCreateData,
  ETIMSInvoiceListParams,
  ConsumptionRecord,
  ConsumptionRecordListParams,
  DemandForecast,
  DemandForecastListParams,
  DemandForecastGenerateData,
  ReorderSuggestion,
  ReorderSuggestionListParams,
  POCancelData,
  TransferCancelData,
} from '@/lib/types/inventory';
import { z } from 'zod';

const BASE = '/api/inventory';

export const inventoryApi = {
  // ==========================================================================
  // Suppliers
  // ==========================================================================

  async listSuppliers(params?: SupplierListParams): Promise<PaginatedResponse<Supplier>> {
    const response = await apiClient.get(`${BASE}/suppliers/`, { params });
    return parseResponse(PaginatedSupplierSchema, response.data, {
      context: 'inventoryApi.listSuppliers',
    });
  },

  async getSupplier(id: number): Promise<Supplier> {
    const response = await apiClient.get(`${BASE}/suppliers/${id}/`);
    return parseResponse(SupplierSchema, response.data, {
      context: 'inventoryApi.getSupplier',
    });
  },

  async createSupplier(data: SupplierCreateData): Promise<Supplier> {
    const response = await apiClient.post(`${BASE}/suppliers/`, data);
    return parseResponse(SupplierSchema, response.data, {
      context: 'inventoryApi.createSupplier',
    });
  },

  async updateSupplier(id: number, data: Partial<SupplierCreateData>): Promise<Supplier> {
    const response = await apiClient.patch(`${BASE}/suppliers/${id}/`, data);
    return parseResponse(SupplierSchema, response.data, {
      context: 'inventoryApi.updateSupplier',
    });
  },

  async deleteSupplier(id: number): Promise<void> {
    await apiClient.delete(`${BASE}/suppliers/${id}/`);
  },

  async toggleSupplierActive(id: number): Promise<Supplier> {
    const response = await apiClient.post(`${BASE}/suppliers/${id}/toggle_active/`);
    return parseResponse(SupplierSchema, response.data, {
      context: 'inventoryApi.toggleSupplierActive',
    });
  },

  // ==========================================================================
  // Purchase Orders
  // ==========================================================================

  async listPurchaseOrders(
    params?: PurchaseOrderListParams
  ): Promise<PaginatedResponse<PurchaseOrder>> {
    const response = await apiClient.get(`${BASE}/purchase-orders/`, { params });
    return parseResponse(PaginatedPurchaseOrderSchema, response.data, {
      context: 'inventoryApi.listPurchaseOrders',
    });
  },

  async getPurchaseOrder(id: number): Promise<PurchaseOrderDetail> {
    const response = await apiClient.get(`${BASE}/purchase-orders/${id}/`);
    return parseResponse(PurchaseOrderDetailSchema, response.data, {
      context: 'inventoryApi.getPurchaseOrder',
    });
  },

  async createPurchaseOrder(data: PurchaseOrderCreateData): Promise<PurchaseOrderDetail> {
    const response = await apiClient.post(`${BASE}/purchase-orders/`, data);
    return parseResponse(PurchaseOrderDetailSchema, response.data, {
      context: 'inventoryApi.createPurchaseOrder',
    });
  },

  async updatePurchaseOrder(
    id: number,
    data: Partial<PurchaseOrderCreateData>
  ): Promise<PurchaseOrderDetail> {
    const response = await apiClient.patch(`${BASE}/purchase-orders/${id}/`, data);
    return parseResponse(PurchaseOrderDetailSchema, response.data, {
      context: 'inventoryApi.updatePurchaseOrder',
    });
  },

  async deletePurchaseOrder(id: number): Promise<void> {
    await apiClient.delete(`${BASE}/purchase-orders/${id}/`);
  },

  async submitPurchaseOrder(id: number): Promise<PurchaseOrderDetail> {
    const response = await apiClient.post(`${BASE}/purchase-orders/${id}/submit/`);
    return parseResponse(PurchaseOrderDetailSchema, response.data, {
      context: 'inventoryApi.submitPurchaseOrder',
    });
  },

  async approvePurchaseOrder(id: number, notes?: string): Promise<PurchaseOrderDetail> {
    const response = await apiClient.post(`${BASE}/purchase-orders/${id}/approve/`, { notes });
    return parseResponse(PurchaseOrderDetailSchema, response.data, {
      context: 'inventoryApi.approvePurchaseOrder',
    });
  },

  async cancelPurchaseOrder(id: number, data?: POCancelData): Promise<PurchaseOrderDetail> {
    const response = await apiClient.post(`${BASE}/purchase-orders/${id}/cancel/`, data);
    return parseResponse(PurchaseOrderDetailSchema, response.data, {
      context: 'inventoryApi.cancelPurchaseOrder',
    });
  },

  async listPurchaseOrderItems(poId: number): Promise<PurchaseOrderItem[]> {
    const response = await apiClient.get(`${BASE}/purchase-orders/${poId}/items/`);
    return parseResponse(z.array(PurchaseOrderItemSchema), response.data, {
      context: 'inventoryApi.listPurchaseOrderItems',
    });
  },

  // ==========================================================================
  // Goods Receipt Notes
  // ==========================================================================

  async listGoodsReceipts(
    params?: GoodsReceiptNoteListParams
  ): Promise<PaginatedResponse<GoodsReceiptNote>> {
    const response = await apiClient.get(`${BASE}/goods-receipts/`, { params });
    return parseResponse(PaginatedGoodsReceiptNoteSchema, response.data, {
      context: 'inventoryApi.listGoodsReceipts',
    });
  },

  async getGoodsReceipt(id: number): Promise<GoodsReceiptNoteDetail> {
    const response = await apiClient.get(`${BASE}/goods-receipts/${id}/`);
    return parseResponse(GoodsReceiptNoteDetailSchema, response.data, {
      context: 'inventoryApi.getGoodsReceipt',
    });
  },

  async createGoodsReceipt(data: GoodsReceiptNoteCreateData): Promise<GoodsReceiptNoteDetail> {
    const response = await apiClient.post(`${BASE}/goods-receipts/`, data);
    return parseResponse(GoodsReceiptNoteDetailSchema, response.data, {
      context: 'inventoryApi.createGoodsReceipt',
    });
  },

  async updateGoodsReceipt(
    id: number,
    data: Partial<GoodsReceiptNoteCreateData>
  ): Promise<GoodsReceiptNoteDetail> {
    const response = await apiClient.patch(`${BASE}/goods-receipts/${id}/`, data);
    return parseResponse(GoodsReceiptNoteDetailSchema, response.data, {
      context: 'inventoryApi.updateGoodsReceipt',
    });
  },

  async confirmGoodsReceipt(id: number): Promise<GoodsReceiptNoteDetail> {
    const response = await apiClient.post(`${BASE}/goods-receipts/${id}/confirm/`);
    return parseResponse(GoodsReceiptNoteDetailSchema, response.data, {
      context: 'inventoryApi.confirmGoodsReceipt',
    });
  },

  async cancelGoodsReceipt(id: number): Promise<GoodsReceiptNoteDetail> {
    const response = await apiClient.post(`${BASE}/goods-receipts/${id}/cancel_grn/`);
    return parseResponse(GoodsReceiptNoteDetailSchema, response.data, {
      context: 'inventoryApi.cancelGoodsReceipt',
    });
  },

  async listGoodsReceiptsByPO(poId: number): Promise<PaginatedResponse<GoodsReceiptNote>> {
    const response = await apiClient.get(`${BASE}/goods-receipts/by_purchase_order/`, {
      params: { po: poId },
    });
    return parseResponse(PaginatedGoodsReceiptNoteSchema, response.data, {
      context: 'inventoryApi.listGoodsReceiptsByPO',
    });
  },

  // ==========================================================================
  // Store Locations
  // ==========================================================================

  async listStoreLocations(
    params?: StoreLocationListParams
  ): Promise<PaginatedResponse<StoreLocation>> {
    const response = await apiClient.get(`${BASE}/store-locations/`, { params });
    return parseResponse(PaginatedStoreLocationSchema, response.data, {
      context: 'inventoryApi.listStoreLocations',
    });
  },

  async getStoreLocation(id: number): Promise<StoreLocation> {
    const response = await apiClient.get(`${BASE}/store-locations/${id}/`);
    return parseResponse(StoreLocationSchema, response.data, {
      context: 'inventoryApi.getStoreLocation',
    });
  },

  async createStoreLocation(data: StoreLocationCreateData): Promise<StoreLocation> {
    const response = await apiClient.post(`${BASE}/store-locations/`, data);
    return parseResponse(StoreLocationSchema, response.data, {
      context: 'inventoryApi.createStoreLocation',
    });
  },

  async updateStoreLocation(
    id: number,
    data: Partial<StoreLocationCreateData>
  ): Promise<StoreLocation> {
    const response = await apiClient.patch(`${BASE}/store-locations/${id}/`, data);
    return parseResponse(StoreLocationSchema, response.data, {
      context: 'inventoryApi.updateStoreLocation',
    });
  },

  async deleteStoreLocation(id: number): Promise<void> {
    await apiClient.delete(`${BASE}/store-locations/${id}/`);
  },

  // ==========================================================================
  // Stock Transfers
  // ==========================================================================

  async listTransfers(
    params?: StockTransferListParams
  ): Promise<PaginatedResponse<StockTransfer>> {
    const response = await apiClient.get(`${BASE}/transfers/`, { params });
    return parseResponse(PaginatedStockTransferSchema, response.data, {
      context: 'inventoryApi.listTransfers',
    });
  },

  async getTransfer(id: number): Promise<StockTransferDetail> {
    const response = await apiClient.get(`${BASE}/transfers/${id}/`);
    return parseResponse(StockTransferDetailSchema, response.data, {
      context: 'inventoryApi.getTransfer',
    });
  },

  async createTransfer(data: StockTransferCreateData): Promise<StockTransferDetail> {
    const response = await apiClient.post(`${BASE}/transfers/`, data);
    return parseResponse(StockTransferDetailSchema, response.data, {
      context: 'inventoryApi.createTransfer',
    });
  },

  async updateTransfer(
    id: number,
    data: Partial<StockTransferCreateData>
  ): Promise<StockTransferDetail> {
    const response = await apiClient.patch(`${BASE}/transfers/${id}/`, data);
    return parseResponse(StockTransferDetailSchema, response.data, {
      context: 'inventoryApi.updateTransfer',
    });
  },

  async submitTransfer(id: number): Promise<StockTransferDetail> {
    const response = await apiClient.post(`${BASE}/transfers/${id}/submit/`);
    return parseResponse(StockTransferDetailSchema, response.data, {
      context: 'inventoryApi.submitTransfer',
    });
  },

  async approveTransfer(id: number, notes?: string): Promise<StockTransferDetail> {
    const response = await apiClient.post(`${BASE}/transfers/${id}/approve/`, { notes });
    return parseResponse(StockTransferDetailSchema, response.data, {
      context: 'inventoryApi.approveTransfer',
    });
  },

  async dispatchTransfer(id: number): Promise<StockTransferDetail> {
    const response = await apiClient.post(`${BASE}/transfers/${id}/dispatch_transfer/`);
    return parseResponse(StockTransferDetailSchema, response.data, {
      context: 'inventoryApi.dispatchTransfer',
    });
  },

  async receiveTransfer(id: number): Promise<StockTransferDetail> {
    const response = await apiClient.post(`${BASE}/transfers/${id}/receive/`);
    return parseResponse(StockTransferDetailSchema, response.data, {
      context: 'inventoryApi.receiveTransfer',
    });
  },

  async cancelTransfer(id: number, data?: TransferCancelData): Promise<StockTransferDetail> {
    const response = await apiClient.post(`${BASE}/transfers/${id}/cancel/`, data);
    return parseResponse(StockTransferDetailSchema, response.data, {
      context: 'inventoryApi.cancelTransfer',
    });
  },

  async listTransferItems(transferId: number): Promise<TransferItem[]> {
    const response = await apiClient.get(`${BASE}/transfers/${transferId}/items/`);
    return parseResponse(z.array(TransferItemSchema), response.data, {
      context: 'inventoryApi.listTransferItems',
    });
  },

  // ==========================================================================
  // Ward Stock
  // ==========================================================================

  async listWardStock(params?: WardStockListParams): Promise<PaginatedResponse<WardStock>> {
    const response = await apiClient.get(`${BASE}/ward-stock/`, { params });
    return parseResponse(PaginatedWardStockSchema, response.data, {
      context: 'inventoryApi.listWardStock',
    });
  },

  async getWardStock(id: number): Promise<WardStock> {
    const response = await apiClient.get(`${BASE}/ward-stock/${id}/`);
    return parseResponse(WardStockSchema, response.data, {
      context: 'inventoryApi.getWardStock',
    });
  },

  async createWardStock(data: WardStockCreateData): Promise<WardStock> {
    const response = await apiClient.post(`${BASE}/ward-stock/`, data);
    return parseResponse(WardStockSchema, response.data, {
      context: 'inventoryApi.createWardStock',
    });
  },

  async updateWardStock(id: number, data: Partial<WardStockCreateData>): Promise<WardStock> {
    const response = await apiClient.patch(`${BASE}/ward-stock/${id}/`, data);
    return parseResponse(WardStockSchema, response.data, {
      context: 'inventoryApi.updateWardStock',
    });
  },

  async consumeWardStock(id: number, data: WardConsumeData): Promise<WardStock> {
    const response = await apiClient.post(`${BASE}/ward-stock/${id}/consume/`, data);
    return parseResponse(WardStockSchema, response.data, {
      context: 'inventoryApi.consumeWardStock',
    });
  },

  async replenishWardStock(id: number, data: WardReplenishData): Promise<WardStock> {
    const response = await apiClient.post(`${BASE}/ward-stock/${id}/replenish/`, data);
    return parseResponse(WardStockSchema, response.data, {
      context: 'inventoryApi.replenishWardStock',
    });
  },

  async returnWardStock(id: number, data: WardReturnData): Promise<WardStock> {
    const response = await apiClient.post(`${BASE}/ward-stock/${id}/return_to_store/`, data);
    return parseResponse(WardStockSchema, response.data, {
      context: 'inventoryApi.returnWardStock',
    });
  },

  async deleteWardStock(id: number): Promise<void> {
    await apiClient.delete(`${BASE}/ward-stock/${id}/`);
  },

  // ==========================================================================
  // Ward Stock Transactions (read-only)
  // ==========================================================================

  async listWardTransactions(
    params?: WardStockTransactionListParams
  ): Promise<PaginatedResponse<WardStockTransaction>> {
    const response = await apiClient.get(`${BASE}/ward-transactions/`, { params });
    return parseResponse(PaginatedWardStockTransactionSchema, response.data, {
      context: 'inventoryApi.listWardTransactions',
    });
  },

  // ==========================================================================
  // Stock Counts
  // ==========================================================================

  async listStockCounts(
    params?: StockCountListParams
  ): Promise<PaginatedResponse<StockCount>> {
    const response = await apiClient.get(`${BASE}/stock-counts/`, { params });
    return parseResponse(PaginatedStockCountSchema, response.data, {
      context: 'inventoryApi.listStockCounts',
    });
  },

  async getStockCount(id: number): Promise<StockCountDetail> {
    const response = await apiClient.get(`${BASE}/stock-counts/${id}/`);
    return parseResponse(StockCountDetailSchema, response.data, {
      context: 'inventoryApi.getStockCount',
    });
  },

  async listStockCountItems(
    countId: number,
    params?: { page?: number; page_size?: number; has_discrepancy?: string; uncounted?: string }
  ): Promise<PaginatedResponse<StockCountItem>> {
    const response = await apiClient.get(`${BASE}/stock-counts/${countId}/items/`, { params });
    return parseResponse(PaginatedStockCountItemSchema, response.data, {
      context: 'inventoryApi.listStockCountItems',
    });
  },

  async createStockCount(data: StockCountCreateData): Promise<StockCountDetail> {
    const response = await apiClient.post(`${BASE}/stock-counts/`, data);
    return parseResponse(StockCountDetailSchema, response.data, {
      context: 'inventoryApi.createStockCount',
    });
  },

  async generateStockCountItems(id: number): Promise<{ created: number; total: number }> {
    const response = await apiClient.post(`${BASE}/stock-counts/${id}/generate_items/`);
    return response.data as { created: number; total: number };
  },

  async startStockCount(id: number): Promise<StockCountDetail> {
    const response = await apiClient.post(`${BASE}/stock-counts/${id}/start/`);
    return parseResponse(StockCountDetailSchema, response.data, {
      context: 'inventoryApi.startStockCount',
    });
  },

  async completeStockCount(id: number): Promise<StockCountDetail> {
    const response = await apiClient.post(`${BASE}/stock-counts/${id}/complete/`);
    return parseResponse(StockCountDetailSchema, response.data, {
      context: 'inventoryApi.completeStockCount',
    });
  },

  async approveStockCount(id: number): Promise<StockCountDetail> {
    const response = await apiClient.post(`${BASE}/stock-counts/${id}/approve/`);
    return parseResponse(StockCountDetailSchema, response.data, {
      context: 'inventoryApi.approveStockCount',
    });
  },

  async cancelStockCount(id: number): Promise<StockCountDetail> {
    const response = await apiClient.post(`${BASE}/stock-counts/${id}/cancel/`);
    return parseResponse(StockCountDetailSchema, response.data, {
      context: 'inventoryApi.cancelStockCount',
    });
  },

  async updateStockCountItem(
    countId: number,
    itemId: number,
    data: StockCountItemUpdateData
  ): Promise<StockCountItem> {
    const response = await apiClient.patch(
      `${BASE}/stock-counts/${countId}/items/${itemId}/`,
      data
    );
    return parseResponse(StockCountItemSchema, response.data, {
      context: 'inventoryApi.updateStockCountItem',
    });
  },

  // ==========================================================================
  // eTIMS Config
  // ==========================================================================

  async listETIMSConfigs(): Promise<ETIMSConfig[]> {
    const response = await apiClient.get(`${BASE}/etims-config/`);
    const parsed = parseResponse(
      z.object({ count: z.number(), results: z.array(ETIMSConfigSchema) }),
      response.data,
      { context: 'inventoryApi.listETIMSConfigs' }
    );
    return parsed.results;
  },

  async getETIMSConfig(id: number): Promise<ETIMSConfig> {
    const response = await apiClient.get(`${BASE}/etims-config/${id}/`);
    return parseResponse(ETIMSConfigSchema, response.data, {
      context: 'inventoryApi.getETIMSConfig',
    });
  },

  async createETIMSConfig(data: ETIMSConfigCreateData): Promise<ETIMSConfig> {
    const response = await apiClient.post(`${BASE}/etims-config/`, data);
    return parseResponse(ETIMSConfigSchema, response.data, {
      context: 'inventoryApi.createETIMSConfig',
    });
  },

  async updateETIMSConfig(
    id: number,
    data: Partial<ETIMSConfigCreateData>
  ): Promise<ETIMSConfig> {
    const response = await apiClient.patch(`${BASE}/etims-config/${id}/`, data);
    return parseResponse(ETIMSConfigSchema, response.data, {
      context: 'inventoryApi.updateETIMSConfig',
    });
  },

  async testETIMSConnection(id: number): Promise<{ success: boolean; message: string }> {
    const response = await apiClient.post(`${BASE}/etims-config/${id}/test_connection/`);
    return response.data as { success: boolean; message: string };
  },

  // ==========================================================================
  // eTIMS Invoices
  // ==========================================================================

  async listETIMSInvoices(
    params?: ETIMSInvoiceListParams
  ): Promise<PaginatedResponse<ETIMSInvoice>> {
    const response = await apiClient.get(`${BASE}/etims-invoices/`, { params });
    return parseResponse(PaginatedETIMSInvoiceSchema, response.data, {
      context: 'inventoryApi.listETIMSInvoices',
    });
  },

  async getETIMSInvoice(id: number): Promise<ETIMSInvoice> {
    const response = await apiClient.get(`${BASE}/etims-invoices/${id}/`);
    return parseResponse(ETIMSInvoiceSchema, response.data, {
      context: 'inventoryApi.getETIMSInvoice',
    });
  },

  async createETIMSInvoice(data: ETIMSInvoiceCreateData): Promise<ETIMSInvoice> {
    const response = await apiClient.post(`${BASE}/etims-invoices/`, data);
    return parseResponse(ETIMSInvoiceSchema, response.data, {
      context: 'inventoryApi.createETIMSInvoice',
    });
  },

  async submitETIMSInvoice(id: number): Promise<{ message: string }> {
    const response = await apiClient.post(`${BASE}/etims-invoices/${id}/submit/`);
    return response.data as { message: string };
  },

  async retryETIMSInvoice(id: number): Promise<{ message: string }> {
    const response = await apiClient.post(`${BASE}/etims-invoices/${id}/retry/`);
    return response.data as { message: string };
  },

  async cancelETIMSInvoice(id: number): Promise<ETIMSInvoice> {
    const response = await apiClient.post(`${BASE}/etims-invoices/${id}/cancel/`);
    return parseResponse(ETIMSInvoiceSchema, response.data, {
      context: 'inventoryApi.cancelETIMSInvoice',
    });
  },

  // ==========================================================================
  // Consumption Records (read-only)
  // ==========================================================================

  async listConsumptionRecords(
    params?: ConsumptionRecordListParams
  ): Promise<PaginatedResponse<ConsumptionRecord>> {
    const response = await apiClient.get(`${BASE}/consumption/`, { params });
    return parseResponse(PaginatedConsumptionRecordSchema, response.data, {
      context: 'inventoryApi.listConsumptionRecords',
    });
  },

  async getConsumptionRecord(id: number): Promise<ConsumptionRecord> {
    const response = await apiClient.get(`${BASE}/consumption/${id}/`);
    return parseResponse(ConsumptionRecordSchema, response.data, {
      context: 'inventoryApi.getConsumptionRecord',
    });
  },

  // ==========================================================================
  // Demand Forecasts
  // ==========================================================================

  async listForecasts(
    params?: DemandForecastListParams
  ): Promise<PaginatedResponse<DemandForecast>> {
    const response = await apiClient.get(`${BASE}/forecasts/`, { params });
    return parseResponse(PaginatedDemandForecastSchema, response.data, {
      context: 'inventoryApi.listForecasts',
    });
  },

  async getForecast(id: number): Promise<DemandForecast> {
    const response = await apiClient.get(`${BASE}/forecasts/${id}/`);
    return parseResponse(DemandForecastSchema, response.data, {
      context: 'inventoryApi.getForecast',
    });
  },

  async generateForecast(
    data: DemandForecastGenerateData
  ): Promise<DemandForecast | { message: string; count: number }> {
    const response = await apiClient.post(`${BASE}/forecasts/generate/`, data);
    // Single drug → DemandForecast, all drugs → { message, count }
    if (data.drug_id) {
      return parseResponse(DemandForecastSchema, response.data, {
        context: 'inventoryApi.generateForecast',
      });
    }
    return response.data as { message: string; count: number };
  },

  // ==========================================================================
  // Reorder Suggestions
  // ==========================================================================

  async listReorderSuggestions(
    params?: ReorderSuggestionListParams
  ): Promise<PaginatedResponse<ReorderSuggestion>> {
    const response = await apiClient.get(`${BASE}/reorder-suggestions/`, { params });
    return parseResponse(PaginatedReorderSuggestionSchema, response.data, {
      context: 'inventoryApi.listReorderSuggestions',
    });
  },

  async getReorderSuggestion(id: number): Promise<ReorderSuggestion> {
    const response = await apiClient.get(`${BASE}/reorder-suggestions/${id}/`);
    return parseResponse(ReorderSuggestionSchema, response.data, {
      context: 'inventoryApi.getReorderSuggestion',
    });
  },

  async convertReorderToPO(
    id: number
  ): Promise<{ message: string; purchase_order_id: number; po_number: string }> {
    const response = await apiClient.post(
      `${BASE}/reorder-suggestions/${id}/convert_to_po/`
    );
    return response.data as { message: string; purchase_order_id: number; po_number: string };
  },

  async dismissReorderSuggestion(id: number): Promise<ReorderSuggestion> {
    const response = await apiClient.post(`${BASE}/reorder-suggestions/${id}/dismiss/`);
    return parseResponse(ReorderSuggestionSchema, response.data, {
      context: 'inventoryApi.dismissReorderSuggestion',
    });
  },
};
