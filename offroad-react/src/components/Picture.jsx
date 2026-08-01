import { useState } from "react";
import PropTypes from "prop-types";
import "./Picture.css";

/**
 * Renders a photo from the generated srcset data.
 *
 * `sizes` describes how wide the image renders at each breakpoint so the
 * browser can pick the smallest adequate file — without it, srcset defaults to
 * 100vw and defeats the whole point.
 *
 * The LQIP is a ~24px inline preview that holds the frame (via the intrinsic
 * aspect ratio) and cross-fades out on load, so there is no layout shift and
 * no empty grey box on slow connections.
 */
export default function Picture({
  photo,
  sizes,
  className = "",
  imgClassName = "",
  priority = false,
  alt,
}) {
  const [loaded, setLoaded] = useState(false);

  const label = alt ?? photo.title;
  const aspectRatio = photo.width && photo.height ? `${photo.width} / ${photo.height}` : undefined;

  return (
    <span
      className={`picture ${loaded ? "is-loaded" : ""} ${className}`}
      style={{
        // Exposed as a custom property rather than `aspect-ratio` directly so
        // call sites can override the intrinsic ratio from CSS — an inline
        // aspect-ratio would beat any stylesheet rule.
        "--picture-ratio": aspectRatio,
        backgroundImage: photo.lqip ? `url(${photo.lqip})` : undefined,
      }}
    >
      <picture>
        {photo.srcset?.avif && <source type="image/avif" srcSet={photo.srcset.avif} sizes={sizes} />}
        <img
          src={photo.image}
          srcSet={photo.srcset?.jpeg}
          sizes={sizes}
          width={photo.width}
          height={photo.height}
          alt={label}
          className={`picture-img ${imgClassName}`}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding={priority ? "sync" : "async"}
          draggable="false"
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(true)}
        />
      </picture>
    </span>
  );
}

const photoShape = PropTypes.shape({
  image: PropTypes.string.isRequired,
  title: PropTypes.string.isRequired,
  width: PropTypes.number,
  height: PropTypes.number,
  lqip: PropTypes.string,
  srcset: PropTypes.shape({
    avif: PropTypes.string,
    jpeg: PropTypes.string,
  }),
});

Picture.propTypes = {
  photo: photoShape.isRequired,
  sizes: PropTypes.string.isRequired,
  className: PropTypes.string,
  imgClassName: PropTypes.string,
  priority: PropTypes.bool,
  alt: PropTypes.string,
};
