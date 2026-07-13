# iptv-buildwithabdallah

This is a simple Samsung Tizen web app scaffold for loading and playing legal M3U/M3U8 IPTV playlists.

Important: this folder cannot be made into an already-installed Samsung TV app just by copying it into the existing USB app cache. Current Samsung developer documentation says USB widget/app installation is no longer supported for security reasons. Use Tizen Studio or the Tizen CLI to sign and install the app on the TV in Developer Mode.

## Files

- `config.xml`: Tizen app configuration.
- `index.html`, `styles.css`, `main.js`: app UI and playlist/player logic.
- `playlist.example.m3u`: test playlist.

## Install Path

1. Install Tizen Studio with the Samsung TV Extension.
2. On the TV, enable Developer Mode from Apps, enter your computer IP, and reboot the TV.
3. In Tizen Studio, import this `iptv-player` folder as an existing web project.
4. Create a Samsung/Tizen certificate profile.
5. Run the project on the connected TV.

The app supports playlist URL loading, pasted M3U text, and local file opening where the platform allows it. Some IPTV servers block browser playback with CORS or require headers that a basic web app cannot send.

## Default Playlists

The playlist screen includes these IPTV-org defaults:

- `https://iptv-org.github.io/iptv/categories/sports.m3u`
- `https://iptv-org.github.io/iptv/index.m3u`
- `https://iptv-org.github.io/iptv/index.category.m3u`
