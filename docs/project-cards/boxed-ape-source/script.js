import { ProjectCard } from './project-card.js';
import { projectsData } from './projects-data.js';
import { MasonryLayout } from './masonry-layout.js';

// Smooth-scrollbar initialization: only for mouse wheel users, fallback to native scroll for trackpad/touch.
document.addEventListener("DOMContentLoaded", () => {
  let scrollbar;
  const content = document.querySelector("#scrollbar-content");
  const checkbox = document.getElementById("smooth-scroll-checkbox");
  let smoothEnabled = false;

  function updateToggleUI() {
    if (checkbox) {
      checkbox.checked = smoothEnabled;
    }
  }

  function enableSmooth() {
    if (!scrollbar && content && window.Scrollbar) {
      scrollbar = Scrollbar.init(content, {
        damping: 0.05,
        renderByPixels: true,
        alwaysShowTracks: false,
        continuousScrolling: true,
      });
      document.body.classList.add('smooth-scrollbar-active');
      if (scrollbar) {
        scrollbar.addListener(onSmoothScroll);
        onSmoothScroll({ offset: scrollbar.offset });
      }
    }
    smoothEnabled = true;
    updateToggleUI();
    window.removeEventListener("scroll", onNativeScroll);
    localStorage.setItem("smooth-scroll-enabled", "1");
  }

  function disableSmooth() {
    if (scrollbar) {
      scrollbar.removeListener(onSmoothScroll);
      scrollbar.destroy();
      scrollbar = null;
      document.body.classList.remove('smooth-scrollbar-active');
    }
    smoothEnabled = false;
    updateToggleUI();
    window.addEventListener("scroll", onNativeScroll);
    onNativeScroll();
    localStorage.setItem("smooth-scroll-enabled", "0");
  }

  function onNativeScroll() {
    onSmoothScroll({ offset: { y: window.scrollY } });
  }

  function onSmoothScroll({ offset }) {
    const nav = document.querySelector(".header-title-nav-wrapper");
    const hero = document.querySelector(".hero");
    const heroLogo = document.querySelector(".hero-logo-wrapper");

    const scrollY = offset.y;

    if (nav && hero) {
      if (scrollY > 50) {
        nav.classList.add("scrolled");
      } else {
        nav.classList.remove("scrolled");
      }

      const heroBottom = hero.getBoundingClientRect().bottom;
      if (heroBottom > nav.offsetHeight) {
        nav.classList.remove("over-dark");
      } else {
        nav.classList.add("over-dark");
      }
    }

    if (heroLogo) {
      heroLogo.style.transform = `translateY(${Math.max(-40, -0.4 * scrollY)}px)`;
      heroLogo.style.opacity = 1 - Math.min(scrollY / 200, 1);
    }

    const imageBlock = document.querySelector(".awards-block-image");
    if (imageBlock) {
      const blockRect = imageBlock.getBoundingClientRect();
      const blockHeight = imageBlock.offsetHeight;
      const zoomAmount = 0.25;
      const scrollProgress = Math.max(
        0,
        Math.min(1, 1 - blockRect.bottom / (blockHeight + window.innerHeight))
      );
      const zoomFactor = 1 + zoomAmount * (1 - scrollProgress);
      imageBlock.style.transform = `scale(${zoomFactor})`;
    }

    const title = document.querySelector(".awards-block-title");
    const awardsLogo = document.querySelector(".ivor-novello-nominee-logo");

    function almostInView(element, enterThreshold = 0.6, exitThreshold = 0.0) {
      const rect = element.getBoundingClientRect();
      const elemHeight = rect.height;
      const visiblePart =
        Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
      const visibleRatio = visiblePart / elemHeight;

      const isFadingIn =
        visibleRatio >= enterThreshold && rect.top < window.innerHeight;
      const isFadingOutAtTop =
        rect.top < 0 && Math.abs(rect.top) > elemHeight * exitThreshold;

      return isFadingIn && !isFadingOutAtTop;
    }

    if (title) {
      if (almostInView(title, 0.6, 0)) {
        title.style.opacity = 1;
        title.style.transform = "translateY(0)";
      } else {
        title.style.opacity = 0;
        title.style.transform = "translateY(60px)";
      }
    }

    if (awardsLogo) {
      if (almostInView(awardsLogo, 0.6, 0)) {
        clearTimeout(window._awardsLogoTimeout);
        window._awardsLogoTimeout = setTimeout(() => {
          awardsLogo.style.opacity = 1;
          awardsLogo.style.transform = "translateY(0)";
        }, 0);
      } else {
        awardsLogo.style.opacity = 0;
        awardsLogo.style.transform = "translateY(60px)";
      }
    }

    // Switch over-dark logic
    const switchEl = document.getElementById("smooth-scroll-toggle");
    if (switchEl && hero) {
      const heroRect = hero.getBoundingClientRect();
      const switchRect = switchEl.getBoundingClientRect();
      // Use the vertical center of the switch
      const switchCenterY = switchRect.top + switchRect.height / 2;
      if (switchCenterY >= heroRect.top && switchCenterY <= heroRect.bottom) {
        switchEl.classList.remove("over-dark");
      } else {
        switchEl.classList.add("over-dark");
      }
    }
  }

  const nav = document.querySelector(".header-title-nav-wrapper");
  const heroLogo = document.querySelector(".hero-logo");

  if (nav && heroLogo) {
    heroLogo.addEventListener("animationend", () => {
      nav.classList.add("visible");
    });
  }

  // Toggle event
  if (checkbox) {
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        enableSmooth();
      } else {
        disableSmooth();
      }
    });
  }

  // Restore setting on load
  const savedSetting = localStorage.getItem("smooth-scroll-enabled");
  if (savedSetting === "1") {
    enableSmooth();
  } else {
    disableSmooth();
  }

  // Initialize project cards using the modular component
  // Store card instances for potential future reference
  const projectCards = {};
  
  // Get the container for card wrappers
  const cardsContainer = document.querySelector('.project-cards-container');
  
  // Sort projects by order property and create card wrappers dynamically
  const sortedProjects = Object.values(projectsData)
    .sort((a, b) => (a.order || 999) - (b.order || 999));
  
  // Create wrapper divs and initialize cards in sorted order
  sortedProjects.forEach(projectData => {
    const containerId = `${projectData.id}-card`;
    
    // Create the wrapper div
    const wrapper = document.createElement('div');
    wrapper.className = 'project-card-wrapper';
    wrapper.id = containerId;
    cardsContainer.appendChild(wrapper);
    
    // Initialize the card
    projectCards[projectData.id] = new ProjectCard(containerId, projectData);
  });
  
  // Initialize masonry layout for cards
  const masonryLayout = new MasonryLayout(
    '.project-cards-container',
    '.project-card-wrapper'
  );
  
  // Make cards and layout accessible globally for debugging
  window.projectCards = projectCards;
  window.masonryLayout = masonryLayout;
});
