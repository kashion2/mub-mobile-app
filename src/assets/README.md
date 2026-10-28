# Assets Folder

This folder should contain your application assets, including:

- logo.png - The main logo for the splash screen (recommended size: 512x512px, high contrast)
- Other images and resources for the app

Please add your actual logo.png file to this folder for the splash screen to display properly.

The SplashScreen.tsx is configured to:
1. Check if logo.png exists
2. Display it centered above the app title
3. Use high contrast styling (black background, white text, yellow accent)
4. Gracefully handle missing logo by showing only text
