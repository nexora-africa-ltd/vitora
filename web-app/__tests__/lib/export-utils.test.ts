import {
  downloadPDF,
  exportReceiptToPDF,
  exportToCSV,
  exportToPDF,
  printPage,
} from '@/lib/export-utils';

const mockText = jest.fn();
const mockSetFontSize = jest.fn();
const mockSetFont = jest.fn();
const mockSetTextColor = jest.fn();
const mockSetDrawColor = jest.fn();
const mockLine = jest.fn();
const mockSetPage = jest.fn();
const mockGetNumberOfPages = jest.fn(() => 2);
const mockSplitTextToSize = jest.fn(() => ['One hundred shillings only']);
const mockOutput = jest.fn(() => new Blob(['pdf'], { type: 'application/pdf' }));

jest.mock('jspdf', () => ({
  jsPDF: jest.fn().mockImplementation(() => ({
    internal: {
      pageSize: {
        getWidth: () => 210,
        getHeight: () => 297,
      },
    },
    setFontSize: mockSetFontSize,
    setFont: mockSetFont,
    setTextColor: mockSetTextColor,
    setDrawColor: mockSetDrawColor,
    text: mockText,
    line: mockLine,
    setPage: mockSetPage,
    getNumberOfPages: mockGetNumberOfPages,
    splitTextToSize: mockSplitTextToSize,
    output: mockOutput,
  })),
}));

const mockAutoTable = jest.fn();
jest.mock('jspdf-autotable', () => ({
  __esModule: true,
  default: (...args: unknown[]) => mockAutoTable(...args),
}));

const mockParse = jest.fn(() => 'id,name\n1,John Doe');
jest.mock('@json2csv/plainjs', () => ({
  Parser: jest.fn().mockImplementation(() => ({ parse: mockParse })),
}));

describe('export-utils', () => {
  const realCreateObjectURL = URL.createObjectURL;
  const realRevokeObjectURL = URL.revokeObjectURL;
  let appendSpy: jest.SpyInstance;
  let removeSpy: jest.SpyInstance;
  let clickSpy: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-15T12:00:00Z'));

    clickSpy = jest.fn();
    appendSpy = jest.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
    removeSpy = jest.spyOn(document.body, 'removeChild').mockImplementation((node) => node);
    URL.createObjectURL = jest.fn(() => 'blob:mock-url');
    URL.revokeObjectURL = jest.fn();
    jest.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
      if (tagName === 'a') {
        return {
          href: '',
          download: '',
          click: clickSpy,
        } as unknown as HTMLElement;
      }
      return document.createElement(tagName);
    }) as typeof document.createElement);
    jest.spyOn(window, 'print').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    appendSpy.mockRestore();
    removeSpy.mockRestore();
    jest.restoreAllMocks();
    URL.createObjectURL = realCreateObjectURL;
    URL.revokeObjectURL = realRevokeObjectURL;
  });

  it('exports table data and object data to PDF', async () => {
    const tableBlob = await exportToPDF('Daily Report', [{ id: 1, active: true }], {
      includeHeader: true,
      includeFooter: true,
      facility: { name: 'Demo Health Facility', address: 'Nairobi', phone: '0700000000' },
      subtitle: 'Summary',
    });
    const objectBlob = await exportToPDF('Single Record', { id: 1, active: true, nested: { ok: true } });

    expect(tableBlob).toBeInstanceOf(Blob);
    expect(objectBlob).toBeInstanceOf(Blob);
    expect(mockText).toHaveBeenCalledWith('Daily Report', 105, expect.any(Number), { align: 'center' });
    expect(mockAutoTable).toHaveBeenCalledTimes(2);
  });

  it('exports a thermal-style receipt PDF', async () => {
    const blob = await exportReceiptToPDF({
      facilityName: 'Demo Health Facility',
      receiptNumber: 'RCPT-001',
      date: '2026-03-15',
      patientName: 'John Doe',
      paymentMethod: 'Cash',
      amount: 100,
      amountInWords: 'One hundred shillings only',
    });

    expect(blob).toBeInstanceOf(Blob);
    expect(mockText).toHaveBeenCalledWith('PAYMENT RECEIPT', 105, expect.any(Number), { align: 'center' });
  });

  it('exports CSV data and triggers downloads for csv and pdf blobs', () => {
    exportToCSV([{ id: 1, name: 'John Doe' }], 'patients');
    expect(mockParse).toHaveBeenCalledWith([{ id: 1, name: 'John Doe' }]);
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();

    downloadPDF(new Blob(['pdf']), 'report');
    expect(clickSpy).toHaveBeenCalledTimes(2);
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it('warns when exporting empty csv data and prints the page', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    exportToCSV([], 'empty');
    expect(warnSpy).toHaveBeenCalledWith('No data to export');

    printPage();
    expect(window.print).toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});
