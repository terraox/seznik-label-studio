#import "JoshLPAPIClient.h"
#import "LPAPI/LPAPI.h"

@implementation JoshLPAPIClient

+ (void)setStateHandler:(void (^)(int, NSString *))handler
{
  [LPAPI didReadPrinterStateHandler:handler];
}

+ (void)scanPrintersWithCompletion:(void (^)(NSArray<NSString *> *))completion
           didOpenPrinterHandler:(void (^)(BOOL))didOpen
{
  [LPAPI scanPrinters:NO
           completion:^(NSArray *scanedPrinterNames) {
             NSMutableArray<NSString *> *names = [NSMutableArray array];
             for (id item in scanedPrinterNames ?: @[]) {
               if ([item isKindOfClass:[NSString class]]) {
                 [names addObject:(NSString *)item];
               }
             }
             if (completion) {
               completion(names);
             }
           }
  didOpenedPrinterHandler:^(BOOL isSuccess) {
    if (didOpen) {
      didOpen(isSuccess);
    }
  }];
}

+ (void)openPrinter:(NSString *)printerName completion:(void (^)(BOOL))completion
{
  [LPAPI openPrinter:printerName ?: @"" completion:^(BOOL isSuccess) {
    if (completion) {
      completion(isSuccess);
    }
  }];
}

+ (void)closePrinter
{
  [LPAPI closePrinter];
}

+ (NSString *)connectingPrinterName
{
  return [LPAPI connectingPrinterName];
}

+ (NSString *)connectingDeviceName
{
  PrinterInfo *info = [LPAPI connectingPrinterDetailInfos];
  return info.deviceName;
}

+ (NSString *)connectingMcuId
{
  PrinterInfo *info = [LPAPI connectingPrinterDetailInfos];
  return info.mcuID;
}

+ (NSString *)connectingDeviceAddress
{
  PrinterInfo *info = [LPAPI connectingPrinterDetailInfos];
  return info.deviceAddress;
}

+ (void)setGapType:(int)gapType
         gapLengthMm:(int)gapLengthMm
            darkness:(int)darkness
               speed:(int)speed
{
  // iOS LPAPI gap length is whole millimetres (unlike Android's 0.01 mm unit).
  [LPAPI setPrintPageGapType:gapType];
  [LPAPI setPrintPageGapLength:MAX(0, gapLengthMm)];
  [LPAPI setPrintDarkness:MAX(0, MIN(15, darkness))];
  [LPAPI setPrintSpeed:MAX(0, MIN(5, speed))];
}

+ (void)printImage:(UIImage *)image completion:(void (^)(BOOL))completion
{
  [LPAPI printImage:image completion:^(BOOL isSuccess) {
    if (completion) {
      completion(isSuccess);
    }
  }];
}

@end
