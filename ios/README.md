# MenuMargin for iOS

This Xcode project adds an iPhone interface around the existing hosted MenuMargin app. Recipe costing, the price book, cloud data, and invoice OCR continue to use the current MenuMargin site and Supabase account.

## iPhone features

- A native tab bar for Cost, Recipes, Prices, Scan, and Menu.
- An in-app Menu for account, sync, exports, help, privacy, and account deletion.
- A native multi-page document camera. Scanned pages are sent to the existing invoice reader as a PDF so its OCR and review flow stay in use. The existing file picker remains available for PDFs and photos.
- CSV and account backup files open in the iPhone share sheet. Use **Save to Files** or **Print** there. Recipe printing creates a PDF for the share sheet.
- A new evergreen plate and leaf home-screen icon. The editable source is `Design/MenuMarginIcon.svg`.

## Open and run in Xcode

1. Open `MenuMargin.xcodeproj` in Xcode.
2. Select the **MenuMargin** scheme and an iPhone simulator.
3. Press **Run** and sign in within the app.

The target uses bundle identifier `com.menumargin.app` and supports iOS 16 and later.

## Download and run a GitHub simulator build

A successful **iOS simulator build** GitHub Actions run uploads a `MenuMargin-iOS-Simulator` artifact for 14 days. It is a Simulator app, not an iPhone-installable IPA.

1. Open the repository's **Actions** tab and select the latest successful **iOS simulator build** run.
2. Download `MenuMargin-iOS-Simulator` under **Artifacts** and unzip it on your Mac.
3. Start an iPhone simulator in Xcode, then use Terminal to install and open the app (replace the path with the unzipped `MenuMargin.app` location):

```sh
xcrun simctl install booted "/path/to/MenuMargin.app"
xcrun simctl launch booted com.menumargin.app
```

To test on a physical iPhone, build and run from Xcode with a personal signing team. App Store or TestFlight distribution requires Apple Developer Program membership.

## Account deletion setup

The Menu tab calls the Supabase Edge Function `delete-account`. The source for that function and the Stripe webhook adjustment are in `../supabase/functions`. Deploy those from the existing MenuMargin Supabase project before account deletion can complete. The function checks the signed-in user, asks for the account email and `DELETE`, requires a recent sign-in, cancels any mapped Stripe subscription, then deletes the Supabase auth user and cascading cloud data. It does not delete any account during app startup or sign-out.

No Apple Developer or Stripe account setup is needed to build the Xcode project. Live account deletion depends on the existing Supabase project and deployed function.

## App Store preparation

This is a hybrid app that reuses the existing hosted MenuMargin service. The current subscription purchase and billing screens are still provided by the website. Before submitting to the App Store, add and test StoreKit in-app purchases and verify the payment experience against the current App Review rules for digital subscriptions. Apple Developer account, App Store Connect product setup, signing, and review are not included in this build.

The embedded web session is separate from Safari, so users sign in once inside the app. First sign-in and the first invoice OCR model download require an internet connection. Offline scanner behavior continues to depend on the hosted app's cached shell, OCR model files, and saved session.
