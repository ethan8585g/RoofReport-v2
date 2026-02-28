// ============================================================
// RoofReporterAI Blog — Frontend (blog.js)
// Handles both /blog listing and /blog/:slug post view
// ============================================================
(function () {
  'use strict';

  var API = '/api/blog';
  var currentPage = 1;
  var currentCategory = '';
  var currentSearch = '';
  var allPosts = [];
  var isPostPage = window.location.pathname.startsWith('/blog/') && window.location.pathname !== '/blog/';

  // ── CATEGORY DISPLAY CONFIG ──
  var categoryConfig = {
    'roofing': { label: 'Roofing', icon: 'fa-home', color: 'sky' },
    'technology': { label: 'Technology', icon: 'fa-microchip', color: 'purple' },
    'business': { label: 'Business', icon: 'fa-briefcase', color: 'emerald' },
    'guides': { label: 'Guides', icon: 'fa-book', color: 'amber' },
    'industry': { label: 'Industry News', icon: 'fa-newspaper', color: 'blue' },
    'tips': { label: 'Tips & Tricks', icon: 'fa-lightbulb', color: 'yellow' },
    'case-studies': { label: 'Case Studies', icon: 'fa-chart-line', color: 'rose' },
    'product': { label: 'Product Updates', icon: 'fa-rocket', color: 'indigo' }
  };

  // ── UTILITY FUNCTIONS ──
  function formatDate(dateStr) {
    if (!dateStr) return '';
    var d = new Date(dateStr);
    return d.toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function getCategoryBadge(cat) {
    var cfg = categoryConfig[cat] || { label: cat, icon: 'fa-tag', color: 'gray' };
    return '<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-' + cfg.color + '-100 text-' + cfg.color + '-700">' +
      '<i class="fas ' + cfg.icon + ' text-[10px]"></i>' + cfg.label + '</span>';
  }

  // ── BLOG LISTING PAGE ──
  function initListingPage() {
    loadCategories();
    loadPosts();

    // Search with debounce
    var searchInput = document.getElementById('blog-search');
    if (searchInput) {
      var timer = null;
      searchInput.addEventListener('input', function () {
        clearTimeout(timer);
        timer = setTimeout(function () {
          currentSearch = searchInput.value.trim();
          currentPage = 1;
          loadPosts();
        }, 400);
      });
    }
  }

  function loadCategories() {
    fetch(API + '/categories')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var cats = data.categories || [];
        var heroEl = document.getElementById('blog-categories-hero');
        var filterEl = document.getElementById('blog-category-filters');

        if (heroEl && cats.length > 0) {
          heroEl.innerHTML = cats.map(function (c) {
            var cfg = categoryConfig[c.category] || { label: c.category, icon: 'fa-tag', color: 'sky' };
            return '<button onclick="filterCategory(\'' + c.category + '\')" class="blog-cat-btn px-4 py-2 rounded-full text-sm font-medium bg-white/15 hover:bg-white/25 text-white backdrop-blur-sm transition-all border border-white/20">' +
              '<i class="fas ' + cfg.icon + ' mr-1.5"></i>' + cfg.label + ' <span class="opacity-70 ml-1">(' + c.count + ')</span></button>';
          }).join('');
        }

        if (filterEl) {
          filterEl.innerHTML = '<button onclick="filterCategory(\'\')" class="blog-filter-btn px-3 py-1.5 rounded-full text-xs font-semibold bg-sky-500 text-white" data-cat="">All</button>' +
            cats.map(function (c) {
              var cfg = categoryConfig[c.category] || { label: c.category, icon: 'fa-tag' };
              return '<button onclick="filterCategory(\'' + c.category + '\')" class="blog-filter-btn px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-sky-100 hover:text-sky-700 transition-all" data-cat="' + c.category + '">' +
                '<i class="fas ' + cfg.icon + ' mr-1"></i>' + cfg.label + '</button>';
            }).join('');
        }
      })
      .catch(function () { });
  }

  window.filterCategory = function (cat) {
    currentCategory = cat;
    currentPage = 1;
    loadPosts();

    // Update active filter button
    var btns = document.querySelectorAll('.blog-filter-btn');
    btns.forEach(function (btn) {
      if (btn.getAttribute('data-cat') === cat) {
        btn.className = 'blog-filter-btn px-3 py-1.5 rounded-full text-xs font-semibold bg-sky-500 text-white';
      } else {
        btn.className = 'blog-filter-btn px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-sky-100 hover:text-sky-700 transition-all';
      }
    });
  };

  function loadPosts() {
    var params = '?page=' + currentPage + '&limit=12';
    if (currentCategory) params += '&category=' + encodeURIComponent(currentCategory);
    if (currentSearch) params += '&search=' + encodeURIComponent(currentSearch);

    fetch(API + '/posts' + params)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var posts = data.posts || [];
        var pagination = data.pagination || {};
        allPosts = posts;

        var gridEl = document.getElementById('blog-grid');
        var emptyEl = document.getElementById('blog-empty');
        var featEl = document.getElementById('blog-featured');
        var moreEl = document.getElementById('blog-load-more');

        if (posts.length === 0) {
          if (gridEl) gridEl.innerHTML = '';
          if (emptyEl) emptyEl.classList.remove('hidden');
          if (featEl) featEl.innerHTML = '';
          if (moreEl) moreEl.classList.add('hidden');
          return;
        }

        if (emptyEl) emptyEl.classList.add('hidden');

        // Featured post (first featured or first post on page 1)
        var featured = null;
        var gridPosts = posts;
        if (currentPage === 1 && !currentSearch && !currentCategory) {
          featured = posts.find(function (p) { return p.is_featured; }) || posts[0];
          gridPosts = posts.filter(function (p) { return p !== featured; });
        }

        if (featEl) {
          if (featured) {
            featEl.innerHTML = renderFeaturedPost(featured);
          } else {
            featEl.innerHTML = '';
          }
        }

        if (gridEl) {
          gridEl.innerHTML = gridPosts.map(renderPostCard).join('');
        }

        if (moreEl) {
          if (pagination.has_more) {
            moreEl.classList.remove('hidden');
          } else {
            moreEl.classList.add('hidden');
          }
        }
      })
      .catch(function (err) {
        console.error('Blog load error:', err);
        var gridEl = document.getElementById('blog-grid');
        if (gridEl) gridEl.innerHTML = '<div class="col-span-full text-center py-10 text-gray-400">Failed to load articles. Please try again.</div>';
      });
  }

  window.loadMorePosts = function () {
    currentPage++;
    loadPosts();
  };

  function renderFeaturedPost(post) {
    var coverStyle = post.cover_image_url
      ? 'background-image:url(' + escapeHtml(post.cover_image_url) + ');background-size:cover;background-position:center'
      : 'background:linear-gradient(135deg,#0ea5e9,#2563eb)';

    return '<a href="/blog/' + escapeHtml(post.slug) + '" class="block group">' +
      '<div class="bg-white rounded-2xl shadow-lg overflow-hidden hover:shadow-xl transition-all duration-300 md:flex">' +
        '<div class="md:w-1/2 h-64 md:h-auto relative" style="' + coverStyle + ';min-height:280px">' +
          '<div class="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent"></div>' +
          '<div class="absolute top-4 left-4">' +
            '<span class="bg-accent-500 text-white text-xs font-bold px-3 py-1.5 rounded-full"><i class="fas fa-star mr-1"></i>Featured</span>' +
          '</div>' +
          (post.cover_image_url ? '' : '<div class="absolute inset-0 flex items-center justify-center"><i class="fas fa-newspaper text-white/30 text-6xl"></i></div>') +
        '</div>' +
        '<div class="md:w-1/2 p-8 flex flex-col justify-center">' +
          '<div class="flex items-center gap-3 mb-3">' +
            getCategoryBadge(post.category) +
            '<span class="text-gray-400 text-xs"><i class="far fa-clock mr-1"></i>' + (post.read_time_minutes || 5) + ' min read</span>' +
          '</div>' +
          '<h2 class="text-2xl md:text-3xl font-bold text-gray-900 mb-3 group-hover:text-sky-600 transition-colors leading-tight">' + escapeHtml(post.title) + '</h2>' +
          '<p class="text-gray-600 mb-4 leading-relaxed line-clamp-3">' + escapeHtml(post.excerpt) + '</p>' +
          '<div class="flex items-center justify-between mt-auto">' +
            '<div class="flex items-center gap-2">' +
              '<div class="w-8 h-8 bg-sky-100 rounded-full flex items-center justify-center"><i class="fas fa-user text-sky-500 text-xs"></i></div>' +
              '<div><div class="text-sm font-semibold text-gray-800">' + escapeHtml(post.author_name || 'RoofReporterAI Team') + '</div>' +
              '<div class="text-xs text-gray-400">' + formatDate(post.published_at) + '</div></div>' +
            '</div>' +
            '<span class="text-sky-500 font-semibold text-sm group-hover:translate-x-1 transition-transform">Read More <i class="fas fa-arrow-right ml-1"></i></span>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</a>';
  }

  function renderPostCard(post) {
    var coverStyle = post.cover_image_url
      ? 'background-image:url(' + escapeHtml(post.cover_image_url) + ');background-size:cover;background-position:center'
      : 'background:linear-gradient(135deg,#0ea5e9 0%,#6366f1 100%)';

    return '<a href="/blog/' + escapeHtml(post.slug) + '" class="block group">' +
      '<article class="bg-white rounded-xl shadow-sm overflow-hidden hover:shadow-lg transition-all duration-300 hover:-translate-y-1 h-full flex flex-col">' +
        '<div class="h-48 relative" style="' + coverStyle + '">' +
          '<div class="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent"></div>' +
          (post.cover_image_url ? '' : '<div class="absolute inset-0 flex items-center justify-center"><i class="fas fa-newspaper text-white/30 text-4xl"></i></div>') +
          '<div class="absolute top-3 left-3">' + getCategoryBadge(post.category) + '</div>' +
        '</div>' +
        '<div class="p-5 flex flex-col flex-1">' +
          '<h3 class="font-bold text-gray-900 mb-2 group-hover:text-sky-600 transition-colors leading-snug line-clamp-2">' + escapeHtml(post.title) + '</h3>' +
          '<p class="text-gray-500 text-sm mb-4 leading-relaxed line-clamp-3 flex-1">' + escapeHtml(post.excerpt) + '</p>' +
          '<div class="flex items-center justify-between pt-4 border-t border-gray-100">' +
            '<span class="text-xs text-gray-400">' + formatDate(post.published_at) + '</span>' +
            '<span class="text-xs text-gray-400"><i class="far fa-clock mr-1"></i>' + (post.read_time_minutes || 5) + ' min</span>' +
          '</div>' +
        '</div>' +
      '</article>' +
    '</a>';
  }

  // ── BLOG POST PAGE ──
  function initPostPage() {
    var pathParts = window.location.pathname.split('/');
    var slug = pathParts[pathParts.length - 1];
    if (!slug) return;

    fetch(API + '/posts/' + encodeURIComponent(slug))
      .then(function (r) {
        if (!r.ok) throw new Error('Not found');
        return r.json();
      })
      .then(function (data) {
        var post = data.post;
        var related = data.related || [];

        if (!post) {
          showNotFound();
          return;
        }

        // Update page title and meta
        document.title = (post.meta_title || post.title) + ' - RoofReporterAI Blog';
        var metaDesc = document.getElementById('meta-desc');
        if (metaDesc) metaDesc.setAttribute('content', post.meta_description || post.excerpt || '');
        var breadcrumb = document.getElementById('breadcrumb-title');
        if (breadcrumb) breadcrumb.textContent = post.title;

        // Render article
        renderArticle(post);

        // Show CTA
        var ctaEl = document.getElementById('blog-cta');
        if (ctaEl) ctaEl.classList.remove('hidden');

        // Related posts
        if (related.length > 0) {
          var relEl = document.getElementById('blog-related');
          var relGrid = document.getElementById('blog-related-grid');
          if (relEl && relGrid) {
            relEl.classList.remove('hidden');
            relGrid.innerHTML = related.map(function (p) {
              return renderPostCard(p);
            }).join('');
          }
        }
      })
      .catch(function () {
        showNotFound();
      });
  }

  function renderArticle(post) {
    var contentEl = document.getElementById('blog-post-content');
    if (!contentEl) return;

    var coverHtml = '';
    if (post.cover_image_url) {
      coverHtml = '<img src="' + escapeHtml(post.cover_image_url) + '" alt="' + escapeHtml(post.title) + '" class="w-full h-64 md:h-96 object-cover rounded-2xl mb-8 shadow-lg">';
    }

    var tagsHtml = '';
    if (post.tags) {
      var tagList = post.tags.split(',').map(function (t) { return t.trim(); }).filter(Boolean);
      if (tagList.length > 0) {
        tagsHtml = '<div class="flex flex-wrap gap-2 mb-8">' +
          tagList.map(function (tag) {
            return '<span class="px-3 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded-full">#' + escapeHtml(tag) + '</span>';
          }).join('') +
          '</div>';
      }
    }

    contentEl.innerHTML =
      coverHtml +
      '<div class="mb-6">' +
        '<div class="flex items-center gap-3 mb-4">' +
          getCategoryBadge(post.category) +
          '<span class="text-gray-400 text-sm"><i class="far fa-clock mr-1"></i>' + (post.read_time_minutes || 5) + ' min read</span>' +
          '<span class="text-gray-400 text-sm"><i class="far fa-eye mr-1"></i>' + (post.view_count || 0) + ' views</span>' +
        '</div>' +
        '<h1 class="text-3xl md:text-4xl font-extrabold text-gray-900 leading-tight mb-4">' + escapeHtml(post.title) + '</h1>' +
        (post.excerpt ? '<p class="text-lg text-gray-500 leading-relaxed">' + escapeHtml(post.excerpt) + '</p>' : '') +
      '</div>' +
      '<div class="flex items-center gap-4 pb-8 mb-8 border-b border-gray-200">' +
        '<div class="w-12 h-12 bg-sky-100 rounded-full flex items-center justify-center"><i class="fas fa-user text-sky-500"></i></div>' +
        '<div>' +
          '<div class="font-semibold text-gray-800">' + escapeHtml(post.author_name || 'RoofReporterAI Team') + '</div>' +
          '<div class="text-sm text-gray-400">' + formatDate(post.published_at) + (post.updated_at !== post.created_at ? ' · Updated ' + formatDate(post.updated_at) : '') + '</div>' +
        '</div>' +
        '<div class="ml-auto flex items-center gap-3">' +
          '<button onclick="shareBlog()" class="text-gray-400 hover:text-sky-500 transition-colors" title="Share"><i class="fas fa-share-alt text-lg"></i></button>' +
        '</div>' +
      '</div>' +
      tagsHtml +
      '<div class="prose prose-lg prose-sky max-w-none blog-content">' +
        post.content +
      '</div>';
  }

  window.shareBlog = function () {
    if (navigator.share) {
      navigator.share({ title: document.title, url: window.location.href });
    } else {
      navigator.clipboard.writeText(window.location.href).then(function () {
        alert('Link copied to clipboard!');
      });
    }
  };

  function showNotFound() {
    var contentEl = document.getElementById('blog-post-content');
    if (contentEl) {
      contentEl.innerHTML =
        '<div class="text-center py-20">' +
          '<i class="fas fa-exclamation-triangle text-6xl text-gray-200 mb-6"></i>' +
          '<h2 class="text-2xl font-bold text-gray-600 mb-2">Article Not Found</h2>' +
          '<p class="text-gray-400 mb-6">The article you\'re looking for doesn\'t exist or has been removed.</p>' +
          '<a href="/blog" class="bg-sky-500 hover:bg-sky-600 text-white font-semibold py-3 px-8 rounded-lg inline-block transition-all"><i class="fas fa-arrow-left mr-2"></i>Back to Blog</a>' +
        '</div>';
    }
  }

  // ── PROSE STYLES (injected for blog content) ──
  function injectProseStyles() {
    var style = document.createElement('style');
    style.textContent = '' +
      '.blog-content { color: #374151; line-height: 1.8; }' +
      '.blog-content h1 { font-size: 2em; font-weight: 800; margin: 1.5em 0 0.5em; color: #111827; }' +
      '.blog-content h2 { font-size: 1.5em; font-weight: 700; margin: 1.5em 0 0.5em; color: #111827; border-bottom: 2px solid #e5e7eb; padding-bottom: 0.3em; }' +
      '.blog-content h3 { font-size: 1.25em; font-weight: 700; margin: 1.3em 0 0.4em; color: #1f2937; }' +
      '.blog-content p { margin: 1em 0; }' +
      '.blog-content ul, .blog-content ol { margin: 1em 0; padding-left: 1.5em; }' +
      '.blog-content li { margin: 0.3em 0; }' +
      '.blog-content a { color: #0ea5e9; text-decoration: underline; }' +
      '.blog-content a:hover { color: #0284c7; }' +
      '.blog-content blockquote { border-left: 4px solid #0ea5e9; background: #f0f9ff; padding: 1em 1.5em; margin: 1.5em 0; border-radius: 0 8px 8px 0; color: #1e40af; font-style: italic; }' +
      '.blog-content img { max-width: 100%; border-radius: 12px; margin: 1.5em 0; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }' +
      '.blog-content code { background: #f3f4f6; padding: 0.2em 0.5em; border-radius: 4px; font-size: 0.9em; color: #e11d48; }' +
      '.blog-content pre { background: #1f2937; color: #e5e7eb; padding: 1.5em; border-radius: 12px; overflow-x: auto; margin: 1.5em 0; }' +
      '.blog-content pre code { background: none; color: inherit; padding: 0; }' +
      '.blog-content table { width: 100%; border-collapse: collapse; margin: 1.5em 0; }' +
      '.blog-content th, .blog-content td { border: 1px solid #e5e7eb; padding: 0.75em 1em; text-align: left; }' +
      '.blog-content th { background: #f9fafb; font-weight: 700; }' +
      '.blog-content hr { border: none; border-top: 2px solid #e5e7eb; margin: 2em 0; }' +
      '.line-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }' +
      '.line-clamp-3 { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }';
    document.head.appendChild(style);
  }

  // ── INIT ──
  injectProseStyles();
  if (isPostPage) {
    initPostPage();
  } else {
    initListingPage();
  }
})();
