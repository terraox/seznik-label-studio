#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

/** Thin ObjC façade over DothanTech LPAPI so Swift Expo modules need no bridging header. */
@interface JoshLPAPIClient : NSObject

+ (void)setStateHandler:(void (^_Nullable)(int code, NSString *_Nullable message))handler;

+ (void)scanPrintersWithCompletion:(void (^)(NSArray<NSString *> *names))completion
           didOpenPrinterHandler:(void (^_Nullable)(BOOL success))didOpen;

+ (void)openPrinter:(NSString *)printerName
         completion:(void (^)(BOOL success))completion;

+ (void)closePrinter;

+ (nullable NSString *)connectingPrinterName;
+ (nullable NSString *)connectingDeviceName;
+ (nullable NSString *)connectingMcuId;
+ (nullable NSString *)connectingDeviceAddress;

+ (void)setGapType:(int)gapType
         gapLengthMm:(int)gapLengthMm
            darkness:(int)darkness
               speed:(int)speed;

+ (void)printImage:(UIImage *)image completion:(void (^)(BOOL success))completion;

@end

NS_ASSUME_NONNULL_END
