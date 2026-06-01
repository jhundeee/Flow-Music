import React, { forwardRef } from 'react';

const SECTION_ORDER = ['all', 'artists', 'albums', 'folders', 'favorites'];

const SECTION_ACCENTS = {
  all: '#00a2ed',
  artists: '#00a2ed',
  albums: '#00a2ed',
  folders: '#00a2ed',
  favorites: '#00a2ed',
};

const Panorama = forwardRef(function Panorama(
  { activeSection, children },
  ref,
) {
  const childrenArray = React.Children.toArray(children);
  const idx = SECTION_ORDER.indexOf(activeSection);
  const activeChild = idx >= 0 ? childrenArray[idx] : null;

  return (
    <div className="panorama-container">
      <div
        className="panorama-section"
        style={{ borderLeft: `4px solid ${SECTION_ACCENTS[activeSection] || 'var(--accent-blue)'}` }}
      >
        {activeChild}
      </div>
    </div>
  );
});

export default Panorama;
export { SECTION_ORDER, SECTION_ACCENTS };
