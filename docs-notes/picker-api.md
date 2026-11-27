# Google Photos Picker API — reference notes for a local Node.js CLI importer

Research notes compiled 2026-11-23 from Google's official documentation on
developers.google.com. Text in quotation marks or block quotes is copied
verbatim from the docs. Text marked **Note:** is my own reading of them. Where
the docs are silent or contradict themselves, that is called out explicitly.

## Source pages

All pages loaded successfully (HTTP 200) on 2026-11-23. The dates are the
"Last updated" stamps shown at the bottom of each page.

| Page | URL | Last updated |
|---|---|---|
| Get started with the Picker API | https://developers.google.com/photos/picker/guides/get-started-picker | 2025-10-06 UTC |
| Google Photos Picker API (REST overview) | https://developers.google.com/photos/picker/reference/rest | 2024-10-09 UTC |
| List and retrieve media items | https://developers.google.com/photos/picker/guides/media-items | 2025-08-28 UTC |
| Updates to the Google Photos APIs | https://developers.google.com/photos/support/updates | 2025-08-28 UTC |
| REST Resource: v1.sessions (PickingSession) | https://developers.google.com/photos/picker/reference/rest/v1/sessions | 2025-10-06 UTC |
| Method: sessions.create | https://developers.google.com/photos/picker/reference/rest/v1/sessions/create | 2025-03-26 UTC |
| Method: sessions.get | https://developers.google.com/photos/picker/reference/rest/v1/sessions/get | 2025-03-10 UTC |
| Method: sessions.delete | https://developers.google.com/photos/picker/reference/rest/v1/sessions/delete | 2025-03-10 UTC |
| REST Resource: v1.mediaItems (PickedMediaItem) | https://developers.google.com/photos/picker/reference/rest/v1/mediaItems | 2025-10-06 UTC |
| Method: mediaItems.list | https://developers.google.com/photos/picker/reference/rest/v1/mediaItems/list | 2025-03-10 UTC |
| Sessions guide | https://developers.google.com/photos/picker/guides/sessions | 2025-10-06 UTC |
| Photo picking: what users see | https://developers.google.com/photos/picker/guides/picking-experience | 2025-10-06 UTC |
| Authorization scopes | https://developers.google.com/photos/overview/authorization | 2025-08-28 UTC |
| Configure your app | https://developers.google.com/photos/overview/configure-your-app | 2025-08-28 UTC |
| Release notes | https://developers.google.com/photos/support/release-notes | 2026-11-16 UTC |

Two general Google OAuth pages outside `/photos`, used only for item 6
(the Photos docs don't cover those points):

| Page | URL | Last updated |
|---|---|---|
| Using OAuth 2.0 to Access Google APIs | https://developers.google.com/identity/protocols/oauth2 | 2026-11-19 UTC |
| OAuth 2.0 for Desktop Apps | https://developers.google.com/identity/protocols/oauth2/native-app | 2026-11-19 UTC |

---

## 1. OAuth scope

There is exactly one Picker API scope (Authorization scopes page, "Picker API scopes" table):

| Scope | Meaning |
|---|---|
| `https://www.googleapis.com/auth/photospicker.mediaitems.readonly` | "Access to create, get, and delete sessions, and to list media items for sessions." |

Every method page (`sessions.create`, `sessions.get`, `sessions.delete`,
`mediaItems.list`) says: "Requires the following OAuth scope:
`https://www.googleapis.com/auth/photospicker.mediaitems.readonly`".

The media-items guide also requires this scope for downloading content: "Ensure
you have a valid OAuth 2.0 access token with the
`https://www.googleapis.com/auth/photospicker.mediaitems.readonly` scope to
authorize your requests."

Other authorization facts:
- "Your application must use OAuth 2.0 to authorize requests. No other authorization protocols are supported."
- "The Google Photos APIs don't support service accounts. Your application must use the other OAuth 2.0 flows available such as OAuth 2.0 for web server applications or OAuth 2.0 for mobile and desktop apps."

## Service endpoint

> "This service has the following service endpoint and all URIs below are relative to this service endpoint: `https://photospicker.googleapis.com`"

| Resource | Method | HTTP |
|---|---|---|
| v1.sessions | create | `POST /v1/sessions` |
| v1.sessions | get | `GET /v1/sessions/{sessionId}` |
| v1.sessions | delete | `DELETE /v1/sessions/{sessionId}` |
| v1.mediaItems | list | `GET /v1/mediaItems` |

**Note:** The polling example in the Sessions guide shows
`GET https://photoslibrary.googleapis.com/v1/sessions/{sessionId}`, which uses
the *Library* API host. That looks like a mistake in the docs: the reference
pages all use `photospicker.googleapis.com`.

## 2. sessions.create

**HTTP request:** `POST https://photospicker.googleapis.com/v1/sessions`

Behaviour (verbatim):
> "Generates a new session during which the user can pick photos and videos for third-party access.
> If the user doesn't have an active Google Photos account, a `FAILED_PRECONDITION` error is returned.
> If the client application creates too many sessions per user, a `RESOURCE_EXHAUSTED` error is returned. Clients are unlikely to reach these limits under normal circumstances. However, clients are still recommended to call `sessions.delete` after each session, to proactively stay within resource limits.
> Once a user taps the Done button to complete a picking session, the `pickerUri` will no longer work. Create a new session to allow the user to pick more photos."

**Query parameters:**

| Parameter | Type | Description (verbatim) |
|---|---|---|
| `requestId` | string | "Optional. A client-provided unique identifier for this request. This ID is used to enable the streamlined picking experience for applications using the OAuth 2.0 flow for limited-input devices. This ID must have the format of a UUID (version 4) string and follow these requirements: Must not contain any sensitive identifying information about the user. Must contain 32 hexadecimal characters divided into five groups separated by hyphens, in the format "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" (or 8-4-4-4-12)." |

**Request body:** "The request body contains an instance of `PickingSession`."
**Note:** Every `PickingSession` field except `pickingConfig` is "Output only",
so in practice the body is `{}` or `{"pickingConfig": {"maxItemCount": "N"}}`.

**Response body:** "If successful, the response body contains a newly created instance of `PickingSession`."

### PickingSession resource

> "Representation of a user session during which the user can pick photos and videos using Google Photos."

```json
{
  "id": string,
  "pickerUri": string,
  "pollingConfig": { object (PollingConfig) },
  "expireTime": string,
  "pickingConfig": { object (PickingConfig) },
  "mediaItemsSet": boolean
}
```

| Field | Type | Description (verbatim) |
|---|---|---|
| `id` | string | "Output only. The Google-generated identifier for this session." |
| `pickerUri` | string | "Output only. The URI used to redirect the user to Google Photos (on web) so they can pick photos and videos for the current session. To view this page successfully, the user must be logged into the Google account that owns this session in their web browser. The pickerUri cannot be opened in an iframe due to security reasons. For web-based applications, you can append `/autoclose` to this URI. The Google Photos window or tab will then close automatically after the user has finished picking, instead of displaying a "Done" screen." |
| `pollingConfig` | object (PollingConfig) | "Output only. The recommended configuration that applications should use while polling `sessions.get`. This field is only populated if media items have not yet been picked for this session (i.e., `mediaItemsSet` is false)." |
| `expireTime` | string (Timestamp format) | "Output only. Time when access to this session (and its picked media items) will expire. Uses RFC 3339, where generated output will always be Z-normalized and use 0, 3, 6 or 9 fractional digits. Offsets other than "Z" are also accepted. Examples: "2014-10-02T15:01:23Z", "2014-10-02T15:01:23.045123456Z" or "2014-10-02T15:01:23+05:30"." |
| `pickingConfig` | object (PickingConfig) | "Optional. Photo-picking configuration for the user's picking experience during this session. This is specified by the client application when calling `sessions.create`, and cannot be modified after the fact (without creating a new session)." |
| `mediaItemsSet` | boolean | "Output only. If set to true, media items have been picked for this session and your application can request the list of picked media items via `mediaItems.list`." |

### PollingConfig

> "Configuration for polling the API."

```json
{ "pollInterval": string, "timeoutIn": string }
```

| Field | Type | Description (verbatim) |
|---|---|---|
| `pollInterval` | string (Duration format) | "Output only. Recommended time between poll requests. A duration in seconds with up to nine fractional digits, ending with 's'. Example: "3.5s"." |
| `timeoutIn` | string (Duration format) | "Output only. The length of time after which the client should stop polling. A value of 0 indicates that the client should stop polling if it hasn't already. A duration in seconds with up to nine fractional digits, ending with 's'. Example: "3.5s"." |

**Value format:** both are protobuf Duration strings such as `"3.5s"`. Parse
them as `parseFloat(value)` seconds after removing the trailing `s`.
`timeoutIn` is relative ("the length of time after which…"), not an absolute
timestamp.

### PickingConfig

> "Client-specified configuration for the user's picking experience during this session."

```json
{ "maxItemCount": string }
```

| Field | Type | Description (verbatim) |
|---|---|---|
| `maxItemCount` | string (int64 format) | "Optional. The maximum number of items that the user can pick during this session. Defaults to 2000 if not specified. If unspecified or set to 0, at most 2000 items can be picked. Values above 2000 will be coerced to 2000. Negative values will result in an `INVALID_ARGUMENT` error." |

**Note:** Because the field is int64, it is a JSON *string* (`"500"`), although
JSON numbers are normally accepted for int64 too.

### `/autoclose`

Yes, it is documented in three places:
- PickingSession reference: "For web-based applications, you can append `/autoclose` to this URI. The Google Photos window or tab will then close automatically after the user has finished picking, instead of displaying a "Done" screen."
- Get-started guide: "For web-based applications, you can append /autoclose to this URI to automatically close the Google Photos window after the user completes their selection."
- Picking-experience guide: "For web-based applications where clicking a link opens Google Photos in a new browser tab or window, you can append /autoclose to the pickerUri. … This skips the Done screen and provides a smoother experience. This behavior is only recommended for web flows, and not for experiences where users might scan a QR code to open Google Photos on a different device."

**Note:** For a CLI that opens the system browser on the same machine,
`pickerUri + "/autoclose"` fits "web flows". If the CLI also prints a QR code
for a phone, give the plain `pickerUri` for that.

## 3. sessions.get and sessions.delete

### sessions.get
- **HTTP:** `GET https://photospicker.googleapis.com/v1/sessions/{sessionId}`
- Path parameter `sessionId` (string): "Required. The Google-generated identifier for this session."
- "The request body must be empty."
- "If successful, the response body contains an instance of `PickingSession`."
- Errors: "If the specified session does not exist or is not owned by the user, a `NOT_FOUND` error is returned. If the session exists but access to the session has expired, a `PERMISSION_DENIED` error is returned."

### sessions.delete
- **HTTP:** `DELETE https://photospicker.googleapis.com/v1/sessions/{sessionId}`
- Path parameter `sessionId` (string): "Required. The Google-generated identifier for the session to delete."
- "The request body must be empty."
- "If successful, the response body is an empty JSON object."
- "A `NOT_FOUND` error is returned if the session does not exist or is not owned by the user."

### Polling and cleanup guidance (Sessions guide)
- "Use the recommended `pollInterval` from `pollingConfig`. Check if `mediaItemsSet` is true. If true, proceed to list the selected media items. If false, continue polling until `timeoutIn` is reached. Handle timeouts and cancellations gracefully."
- Get-started guide: "Note: Every time you poll a session the response contains recommended intervals and timeouts to configure your polling."
- "It's a best practice to delete sessions once the user has selected media items and your app has retrieved the media item bytes."
- "Note: During development, if you create test sessions without storing their IDs, you won't be able to retrieve or delete them individually."

**Note:** Delete only *after* downloading. `expireTime` covers "access to this
session (and its picked media items)", so deleting early probably invalidates
the listing or the baseUrls. The docs don't say this outright.

## 4. mediaItems.list

- **HTTP:** `GET https://photospicker.googleapis.com/v1/mediaItems`
- "The request body must be empty."
- "A `FAILED_PRECONDITION` error is returned if the user has not yet finished picking media items for the specified session. In this scenario, your application should poll `sessions.get` until the session is ready before retrying this method."

**Query parameters:**

| Parameter | Type | Description (verbatim) |
|---|---|---|
| `sessionId` | string | "Required. The Google-generated identifier for this session." |
| `pageSize` | integer | "Optional. The maximum number of media items to return. The service may return fewer than this value (including zero results). If unspecified or set to 0, at most 50 media items is returned. The maximum value is 100; values above 100 will be coerced to 100. Negative values will result in an `INVALID_ARGUMENT` error." |
| `pageToken` | string | "Optional. A page token, received from a previous `mediaItems.list` call. Provide this to retrieve the subsequent page." |

**Response body:**

```json
{
  "mediaItems": [ { object (PickedMediaItem) } ],
  "nextPageToken": string
}
```

| Field | Description (verbatim) |
|---|---|
| `mediaItems[]` | "A page of picked media items." |
| `nextPageToken` | "If set, this field can be used as the pageToken in a subsequent `mediaItems.list` call to retrieve the next page of picked media items. If this field is omitted, there are no subsequent pages." |

**Note:** A page may contain zero items even when there are more pages. Loop
on `nextPageToken`, not on the number of items returned.

### PickedMediaItem

> "Representation of a photo or video that was picked by the user."

```json
{
  "id": string,
  "createTime": string,
  "type": enum (Type),
  "mediaFile": { object (MediaFile) }
}
```

| Field | Type | Description (verbatim) |
|---|---|---|
| `id` | string | "Identifier for the media item. This is a persistent identifier that can be used between sessions to identify this media item." |
| `createTime` | string (Timestamp format) | "Time when the media item was created (not when it was uploaded to Google Photos). Uses RFC 3339, where generated output will always be Z-normalized and use 0, 3, 6 or 9 fractional digits. …" |
| `type` | enum (Type) | "The type of this media item." |
| `mediaFile` | object (MediaFile) | "The media file that constitutes this media item." |

**Type enum:**

| Value | Description |
|---|---|
| `TYPE_UNSPECIFIED` | "The type is not specified." |
| `PHOTO` | "The media item represents a photo." |
| `VIDEO` | "The media item represents a video." |

**Note:** There is no separate value for motion photos. The media-items guide
says only that they "contain both photo and video elements".

**Note:** Because `id` is persistent across sessions, it works as a
de-duplication key for repeated imports.

### MediaFile

> "Representation of a media file."

```json
{
  "baseUrl": string,
  "mimeType": string,
  "filename": string,
  "mediaFileMetadata": { object (MediaFileMetadata) }
}
```

| Field | Type | Description (verbatim) |
|---|---|---|
| `baseUrl` | string | "A URL to fetch the media file's bytes. To download a media file, the API client must add the parameters specified in the developer documentation to this URL. For example, '=w2048-h1024' will set the dimensions of a media item of type photo to have a width of 2048 px and height of 1024 px." |
| `mimeType` | string | "MIME type of the media file. For example, image/jpeg." |
| `filename` | string | "Filename of the media file." |
| `mediaFileMetadata` | object (MediaFileMetadata) | "Metadata related to the media file, such as height and width." |

**Note:** `baseUrl`, `mimeType` and `filename` live on `item.mediaFile`, not
directly on `item`. The media-items guide's prose lists them as if they were
on `PickedMediaItem` itself; the reference schema is authoritative.

### MediaFileMetadata

> "Metadata about a media file."

```json
{
  "width": integer,
  "height": integer,
  "cameraMake": string,
  "cameraModel": string,
  // Union field metadata can be only one of the following:
  "photoMetadata": { object (PhotoMetadata) },
  "videoMetadata": { object (VideoMetadata) }
}
```

| Field | Type | Description (verbatim) |
|---|---|---|
| `width` | integer | "Original width (in pixels) of the media file." |
| `height` | integer | "Original height (in pixels) of the media file." |
| `cameraMake` | string | "Brand of the camera with which the media was captured." |
| `cameraModel` | string | "Model of the camera with which the media was captured." |
| `photoMetadata` | object (PhotoMetadata) | "Metadata for a photo media type." (union `metadata`) |
| `videoMetadata` | object (VideoMetadata) | "Metadata for a video media type." (union `metadata`) |

### PhotoMetadata

> "Metadata that is specific to a photo, such as, ISO, focal length, and exposure time. Some of these fields may not be set."

| Field | Type | Description (verbatim) |
|---|---|---|
| `focalLength` | number | "Focal length of the camera lens with which the photo was taken." |
| `apertureFNumber` | number | "Aperture f number of the camera lens with which the photo was taken." |
| `isoEquivalent` | integer | "ISO of the camera with which the photo was taken." |
| `exposureTime` | string (Duration format) | "Exposure time of the camera aperture when the photo was taken. A duration in seconds with up to nine fractional digits, ending with 's'. Example: "3.5s"." |

### VideoMetadata

> "Metadata that is specific to a video. For example, fps."

| Field | Type | Description (verbatim) |
|---|---|---|
| `fps` | number | "Frame rate of the video." |
| `processingStatus` | enum (VideoProcessingStatus) | "Processing status of the video." |

**VideoProcessingStatus enum:**

| Value | Description (verbatim) |
|---|---|
| `UNSPECIFIED` | "Video processing status is not specified." |
| `PROCESSING` | "Video is being processed. The user sees an icon for this video in the Google Photos app; however, it isn't playable yet." |
| `READY` | "Video processing is complete and this video is now ready for viewing. Attempting to download a video not in the READY state may fail." |
| `FAILED` | "Something has gone wrong and the video has failed to process." |

**Note:** The media-items guide says "check that the media items's
`mediaMetadata.status` field is `READY`". That is the Library API field name.
For the Picker API, the field is
`mediaFile.mediaFileMetadata.videoMetadata.processingStatus`.

**Not in the schema:** There is no GPS/location field and no description field
on any Picker schema.

## 5. Downloading content via baseUrl

### Authorization and lifetime (media-items guide, "For the Picker API")
> "All `PickedMediaItem.mediaFile` objects include a `baseUrl`.
> Base URLs remain active for 60 minutes, but can expire sooner if the user revokes your app's permissions through their Google Account settings.
> Note: Requests to a `PickedMediaItem.mediaFile` `baseUrl` must include an `Authorization` header with a valid OAuth 2.0 bearer token."

So send `Authorization: Bearer <access_token>` on the `GET` to `baseUrl + "=…"`.
This is different from the Library API, whose baseUrls need no header.

> "Warning: If you use the base URL you must specify a download parameter, or both the maximum width and the maximum height."

Parameters are appended after `=` and joined with `-`, e.g. `baseUrl + "=w2048-h1024"`.

### Image base URL parameters

| Param | What the docs say it returns (verbatim) |
|---|---|
| `w`, `h` | "To access an image media item, such as a photo or a thumbnail for a video, you must specify the dimensions that you plan to display in your application (so that the image can be scaled into these dimensions while preserving the aspect ratio)." Form: `base-url=wmax-width-hmax-height`, e.g. `=w2048-h1024`. |
| `c` | "If you want to crop the image to the exact width and height dimensions you have specified, concatenate the base URL with the optional `-c` parameter along with the mandatory `w` and `h` parameters. The size (in pixels) should be in the range [1, 16383]. If either the width or the height of the image, exceeds the requested size, the image is scaled down and cropped (maintaining the aspect ratio)." e.g. `=w256-h256-c`. |
| `d` | "If you want to download the image retaining all the Exif metadata except the location metadata, concatenate the base URL with the `d` parameter." Form: `base-url=d`. "In this example, the application downloads an image with all metadata except the location metadata." |

### Video base URL parameters

| Param | What the docs say it returns (verbatim) |
|---|---|
| `dv` | "To access the bytes of a video mediaItem, concatenate the baseUrl with the download video, `dv` parameter. The `dv` parameter requests a high quality, transcoded version of the original video. The parameter is not compatible with the `w` and `h` parameters. Base URLs for video downloads can take up to a few seconds to return bytes. Before using this parameter, check that the media items's … status field is `READY`. Otherwise, if your media item has not finished processing you may receive an error." |
| `w`, `h`, `c`, `d` | "To access the thumbnail of the video use any of the image base URL parameters. By default, all video thumbnails include an overlay of a playback button." |
| `no` | "If you want to retrieve the thumbnail of a video without the overlay of a playback button, concatenate the base URL with the `no` parameter. The `no` parameter must be used with at least one of the image base URL parameters." e.g. `=w1280-h720-no`. |

### Motion photo base URLs
> "Motion photos contain both photo and video elements. You can use parameters from either image base URLs or video base URLs for motion photo baseUrl requests."
- `dv`: "To retrieve the video element of a motion photo media item, use the `dv` parameter as you would to download from video base URLs."
- `w`, `h`, `c`, `d`: "To retrieve the photo element of a motion photo media item, use the format for image base URLs."

### What the docs do and don't say about fidelity
- **`=d` (images):** documented as keeping "all the Exif metadata except the location metadata". **GPS/location EXIF is removed.** The docs never say `=d` returns the byte-for-byte original file or the original format. Don't rely on byte identity, though in practice `mimeType` (e.g. HEIC vs JPEG) is the best hint for the file extension.
- **`=wN-hN` (images):** scaled to fit "while preserving the aspect ratio". The docs don't state the output format, whether it is re-encoded, or whether EXIF is kept. Treat it as a derived rendition, not the original.
- **`=dv` (videos):** "a high quality, transcoded version of the original video". **Not the original bytes.**
- There is no documented parameter that returns the untouched original file with location metadata intact. The Picker schema has no location field either. **If the importer needs GPS, it cannot get it from the Picker API.**

## 6. OAuth client type, Testing status, refresh tokens

### What the Photos docs say
- The Photos docs do **not** require a specific client type. Configure-your-app walks through a **Web application** client as its example: "This example uses an application where the entire OAuth flow is handled server-side, such as the one in our samples. The setup process may vary for other implementation scenarios. … Select your Application type. In this example, the application type is Web application."
- The Authorization page allows desktop flows: "Your application must use the other OAuth 2.0 flows available such as OAuth 2.0 for web server applications or OAuth 2.0 for mobile and desktop apps."
- Client ID is sticky: "Resources created through any of the Google Photos APIs can only be accessed or modified using the original client ID used to create them. For example, if you create a session in the Picker API with a specific client ID and later change that client ID in your app, your app will lose access to any API resources created with the previous client ID. Plan carefully and choose the correct client ID type for the Photos API you are using."
- Verification: "Before you can launch a public application that accesses the Photos APIs, your app must be reviewed by Google. An "Unverified app" message appears on the screen when you test your application, until it is verified." The Authorization page adds: "If your application accesses the Google Photos APIs, it must pass the OAuth verification review."
- The Photos docs say **nothing** about "Testing" publishing status or refresh-token lifetime. The only refresh-token mention is generic: "Some flows include additional steps, such as using refresh tokens to acquire new access tokens."
- The `requestId` parameter on `sessions.create` mentions "applications using the OAuth 2.0 flow for limited-input devices". This is an optional streamlined path, not a requirement.

### General Google OAuth docs (outside `/photos`)
- **Desktop app client** (OAuth 2.0 for Desktop Apps): "This document explains how desktop applications (such as applications running on Windows, macOS, or Linux, or command-line interface (CLI) tools) use Google's OAuth 2.0 endpoints…" and "Select the **Desktop app** application type." It also says: "Desktop apps are public clients and cannot keep secrets confidential. Always use PKCE (Proof Key for Code Exchange) when requesting authorization codes." The redirect is a loopback listener: "`http://127.0.0.1:port` or `http://[::1]:port` … start an HTTP listener on a random available port." The out-of-band (OOB) flow "has been deprecated and is no longer supported." Also: "Incremental authorization is not supported for installed apps or devices."
  **Note:** For a local Node CLI, the Desktop app client with loopback redirect and PKCE is the documented fit, even though the Photos pages show a Web client.
- **Testing status → 7-day refresh tokens** (Using OAuth 2.0 to Access Google APIs, "Refresh token expiration"): "A Google Cloud Platform project with an OAuth consent screen configured for an external user type and a publishing status of "Testing" is issued a refresh token expiring in 7 days, unless the only OAuth scopes requested are a subset of name, email address, and user profile (through the userinfo.email, userinfo.profile, openid scopes, or their OpenID Connect equivalents)."
  **Note:** `photospicker.mediaitems.readonly` is not one of those scopes. A personal importer left in Testing will need the user to re-authorize every 7 days.
- Other refresh-token invalidation causes on that page include: the user revoked access; "The refresh token has not been used for six months."; and "There is currently a limit of 100 refresh tokens per Google Account per OAuth 2.0 client ID. If the limit is reached, creating a new refresh token automatically invalidates the oldest refresh token without warning."

## 7. What the March 31, 2025 Library API changes removed

From "Updates to the Google Photos APIs" (posted September 2024):

**Scopes removed:** "the following scopes will be removed from the Library API after March 31, 2025:"
- `photoslibrary.readonly`
- `photoslibrary.sharing`
- `photoslibrary`

**Scopes remaining:** `photoslibrary.appendonly`, `photoslibrary.readonly.appcreateddata`, `photoslibrary.edit.appcreateddata`.

**Library read access restricted to app-created content:** "What's changing: You can now only list, search, and retrieve albums and media items that were created by your app." This affects `albums.get`, `albums.list`, `mediaItems.batchGet`, `mediaItems.get`, `mediaItems.list` and `mediaItems.search`, which keep only `photoslibrary.readonly.appcreateddata`. The page's advice: "If your app needs users to select photos or albums from their entire library, use to the new Google Photos Picker API."

**Shared album access removed:** "Shared albums and the associated API functions (share, unshare, get, join, leave, and list) will return a 403 PERMISSION_DENIED after March 31, 2025." The methods table lists `albums.share`, `albums.unshare`, `sharedAlbums.get`, `sharedAlbums.join`, `sharedAlbums.leave` and `sharedAlbums.list` as "These methods will no longer be available." (scopes remaining: "None"). It adds: "Note: `sharedAlbums.list` is being removed because there will no longer be shared albums created by your app available to list." Recommended alternative: "Direct users to the Google Photos app to manage sharing themselves."

**Date discrepancy:** The updates page says "after March 31, 2025" and "Note: All changes take effect March 2025." The release notes entry is dated **April 1, 2025** ("This release implements the previously announced changes to the Photos APIs. Removal of some scopes from the Library API. Restriction of several methods to only work with app created content."). The site banner says "On April 1st, 2025, some scopes in the Library API were removed."

**Consequence for this importer:** Picking arbitrary photos from a user's
library (including from shared albums they can see) now has to go through the
Picker API with the user choosing items interactively. The Library API can no
longer enumerate or read the user's existing library.

---

## Minimal flow for the CLI (derived from the above)

1. OAuth with a Desktop app client: system browser, loopback redirect, PKCE, scope `https://www.googleapis.com/auth/photospicker.mediaitems.readonly`.
2. Call `POST /v1/sessions` with body `{"pickingConfig":{"maxItemCount":"N"}}` (optional). Store `id`.
3. Open `pickerUri + "/autoclose"` in the browser.
4. Loop `GET /v1/sessions/{id}`: sleep `pollingConfig.pollInterval` (`"Ns"`), stop once `mediaItemsSet` is true or `timeoutIn` has elapsed or is `0`.
5. Call `GET /v1/mediaItems?sessionId={id}&pageSize=100&pageToken=…` until there is no `nextPageToken`.
6. For each item, `GET mediaFile.baseUrl + "=d"` (photo) or `"=dv"` (video, only when `processingStatus == READY`), with `Authorization: Bearer <token>`. Finish within 60 minutes of listing, or list again to get fresh baseUrls.
7. Call `DELETE /v1/sessions/{id}`.
