/*
 * VoiceVote dependent dropdowns.
 * Works in plain HTML/JavaScript on GitHub Pages.
 * The grade, section and project field names stay compatible with VoiceVote_Code.gs.
 */
(function (global) {
  'use strict';

  function unique(values) {
    return Array.from(new Set(values)).sort(function (a, b) {
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });
  }

  function resetSelect(select, prompt, options) {
    select.replaceChildren();
    select.add(new Option(prompt, ''));
    options.forEach(function (value) {
      select.add(new Option(value, value));
    });
    select.disabled = options.length === 0;
    select.value = '';
  }

  function init(config) {
    const grade = document.querySelector(config.gradeSelector || '#studentClass');
    const section = document.querySelector(config.sectionSelector || '#section');
    const project = document.querySelector(config.projectSelector || '#project');
    const status = config.statusSelector ? document.querySelector(config.statusSelector) : null;
    if (!grade || !section || !project) {
      throw new Error('Class/Grade, Section, or Project dropdown was not found.');
    }
    const preserveExistingGrades = config.preserveExistingGrades === true;
    const existingGradeValues = Array.from(grade.options)
      .map(function (option) { return option.value.trim(); })
      .filter(Boolean);
    let catalog = [];
    const search = config.searchSelector ? document.querySelector(config.searchSelector) : null;
    const searchResults = config.searchResultsSelector ? document.querySelector(config.searchResultsSelector) : null;
    const searchStatus = config.searchStatusSelector ? document.querySelector(config.searchStatusSelector) : null;
    const searchSelected = config.searchSelectedSelector ? document.querySelector(config.searchSelectedSelector) : null;
    const maxMatches = 12;

    function isBlocked() {
      return typeof config.isVoteLocked === 'function' && config.isVoteLocked();
    }

    function normalizeTerm(value) {
      return String(value || '').normalize('NFKD').replace(/[\\u0300-\\u036f]/g, '').toLocaleLowerCase().trim();
    }

    function hideSearchResults() {
      if (!searchResults) return;
      searchResults.hidden = true;
      if (search) search.setAttribute('aria-expanded', 'false');
    }

    function chooseQuickProject(entry) {
      if (isBlocked()) return;
      // Reuse the dependent dropdown handlers and the exact catalog values.
      // This safely supports duplicate names across different classes.
      grade.value = entry.grade;
      grade.dispatchEvent(new Event('change', { bubbles: true }));
      section.value = entry.section;
      section.dispatchEvent(new Event('change', { bubbles: true }));
      project.value = entry.project;
      project.dispatchEvent(new Event('change', { bubbles: true }));
      if (search) search.value = entry.project;
      if (searchSelected) searchSelected.textContent =
        'Selected: ' + entry.project + ' — Class ' + entry.grade + ', ' + entry.section;
      if (searchStatus) searchStatus.textContent =
        'Project selected. Add your feedback and star rating below.';
      hideSearchResults();
      if (search) search.blur();
    }

    function renderQuickSearch() {
      if (!search || !searchResults) return;
      searchResults.replaceChildren();
      hideSearchResults();
      if (isBlocked()) return;
      const query = normalizeTerm(search.value);
      if (query.length < 2) {
        if (searchStatus) searchStatus.textContent =
          'Type at least 2 characters to find a project across all classes and sections.';
        return;
      }
      const terms = query.split(/\\s+/).filter(Boolean);
      const matches = catalog.filter(function(entry) {
        const haystack = normalizeTerm(entry.project + ' ' + entry.grade + ' ' + entry.section);
        return terms.every(function(term) { return haystack.includes(term); });
      }).sort(function(a, b) {
        const aStart = normalizeTerm(a.project).startsWith(query) ? 0 : 1;
        const bStart = normalizeTerm(b.project).startsWith(query) ? 0 : 1;
        return aStart - bStart
          || a.project.localeCompare(b.project, undefined, { sensitivity: 'base', numeric: true })
          || a.grade.localeCompare(b.grade, undefined, { numeric: true })
          || a.section.localeCompare(b.section, undefined, { numeric: true });
      });
      if (!matches.length) {
        if (searchStatus) searchStatus.textContent =
          'No active projects match. Try another name or use class and section.';
        return;
      }
      matches.slice(0, maxMatches).forEach(function(entry) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'search-option';
        button.textContent = entry.project + ' — Class ' + entry.grade + ' / ' + entry.section;
        button.addEventListener('click', function() { chooseQuickProject(entry); });
        searchResults.appendChild(button);
      });
      searchResults.hidden = false;
      search.setAttribute('aria-expanded', 'true');
      if (searchStatus) searchStatus.textContent =
        matches.length + ' matching project(s)' +
        (matches.length > maxMatches ? '; showing first ' + maxMatches + '. Type more to refine.' : '. Select a result.');
    }

    function setStatus(message) {
      if (status) status.textContent = message;
    }

    function updateProjects() {
      const options = unique(catalog.filter(function (entry) {
        return entry.grade === grade.value && entry.section === section.value;
      }).map(function (entry) { return entry.project; }));
      resetSelect(project, options.length ? 'Select science fair project' : 'No projects for this selection', options);
      setStatus(section.value ? (options.length + ' project(s) available') : 'Select a section to view projects.');
    }

    function updateSections() {
      const options = unique(catalog.filter(function (entry) {
        return entry.grade === grade.value;
      }).map(function (entry) { return entry.section; }));
      resetSelect(section, options.length ? 'Select section' : 'No sections for this grade', options);
      updateProjects();
      if (!grade.value) setStatus('Select a class/grade to begin.');
      else if (!options.length) setStatus('No active projects for this class/grade.');
    }

    function setCatalog(entries) {
      if (!Array.isArray(entries)) throw new Error('Project catalog must be an array.');
      catalog = entries.filter(function (entry) {
        return entry && ['grade', 'section', 'project'].every(function (key) {
          return (typeof entry[key] === 'string' || typeof entry[key] === 'number') && String(entry[key]).trim();
        });
      }).map(function (entry) {
        return { grade: String(entry.grade).trim(), section: String(entry.section).trim(), project: String(entry.project).trim() };
      });
      if (entries.length && !catalog.length) {
        throw new Error('The Projects catalog has no valid rows. Each row needs grade, section and project fields.');
      }

      const grades = (preserveExistingGrades && existingGradeValues.length)
        ? existingGradeValues : unique(catalog.map(function (entry) { return entry.grade; }));
      resetSelect(grade, 'Select class/grade', grades);
      updateSections();
      if (search) {
        search.disabled = isBlocked() || catalog.length === 0;
        if (searchSelected) searchSelected.textContent = '';
        renderQuickSearch();
      }
      if (catalog.length === 0) setStatus('No active projects are listed yet.');
    }

    function loadCatalog(apiUrl) {
      return new Promise(function (resolve, reject) {
        if (!/^https:\/\//i.test(apiUrl)) {
          reject(new Error('Use your HTTPS Google Apps Script /exec URL.'));
          return;
        }
        const name = 'voiceVoteCatalog' + Date.now() + Math.floor(Math.random() * 100000);
        const script = document.createElement('script');
        let finished = false;
        const timeout = setTimeout(function () {
          finish(new Error('Project list request timed out.'));
        }, 15000);
        function finish(error, data) {
          if (finished) return;
          finished = true;
          clearTimeout(timeout);
          delete global[name];
          script.remove();
          if (error) reject(error);
          else resolve(data);
        }
        global[name] = function (payload) {
          if (!payload || !payload.success || !Array.isArray(payload.projects)) {
            finish(new Error((payload && payload.message) || 'Could not load the project list.'));
          } else {
            finish(null, payload.projects);
          }
        };
        script.onerror = function () { finish(new Error('Unable to reach Google Apps Script. Check the web app URL, deployment access and network connection.')); };
        script.onload = function () {
          if (!finished) finish(new Error('Apps Script returned no catalog callback. Check that the deployed web app supports action=catalog and JSONP.'));
        };
        const separator = apiUrl.includes('?') ? '&' : '?';
        script.src = apiUrl + separator + 'action=catalog&callback=' + encodeURIComponent(name);
        document.head.appendChild(script);
      });
    }

    // Prefer a same-origin snapshot on GitHub Pages. This avoids depending on
    // cross-site Google ContentService redirects in each visitor's browser.
    // Fall back to the live JSONP API if the snapshot cannot be read.
    function loadSnapshot(url) {
      if (typeof global.fetch !== 'function') {
        return Promise.reject(new Error('Browser does not support fetch.'));
      }
      return global.fetch(url, { cache: 'no-store', credentials: 'same-origin' })
        .then(function(response) {
          if (!response.ok) throw new Error('Project snapshot returned HTTP ' + response.status);
          return response.json();
        })
        .then(function(payload) {
          if (!payload || payload.success !== true || !Array.isArray(payload.projects) || !payload.projects.length) {
            throw new Error('Project snapshot is missing or empty.');
          }
          return payload.projects;
        });
    }

    grade.addEventListener('change', updateSections);
    section.addEventListener('change', updateProjects);
    if (search && searchResults) {
      search.addEventListener('input', function() {
        if (searchSelected) searchSelected.textContent = '';
        renderQuickSearch();
      });
      search.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') { hideSearchResults(); return; }
        if (event.key === 'ArrowDown' && !searchResults.hidden) {
          const first = searchResults.querySelector('button');
          if (first) { event.preventDefault(); first.focus(); }
        }
        if (event.key === 'Enter' && !searchResults.hidden) {
          const first = searchResults.querySelector('button');
          if (first) { event.preventDefault(); first.click(); }
        }
      });
      searchResults.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
          hideSearchResults();
          search.focus();
          return;
        }
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        const buttons = Array.from(searchResults.querySelectorAll('button'));
        const index = buttons.indexOf(event.target);
        const next = buttons[index + (event.key === 'ArrowDown' ? 1 : -1)];
        if (next) { event.preventDefault(); next.focus(); }
      });
      grade.addEventListener('change', function() {
        if (searchSelected) searchSelected.textContent = '';
      });
      section.addEventListener('change', function() {
        if (searchSelected) searchSelected.textContent = '';
      });
    }
    grade.disabled = true;
    resetSelect(section, 'Select class/grade first', []);
    resetSelect(project, 'Select class/grade and section first', []);
    setStatus('Loading projects…');

    if (config.catalog) {
      setCatalog(config.catalog);
      return Promise.resolve({ setCatalog: setCatalog, loadCatalog: loadCatalog });
    }
    if (!config.apiUrl) {
      setStatus('Missing Apps Script URL.');
      return Promise.reject(new Error('Pass apiUrl or catalog to VoiceVoteCatalogSelector.init.'));
    }
    const request = (config.snapshotUrl && typeof global.fetch === 'function')
      ? loadSnapshot(config.snapshotUrl).catch(function(snapshotError) {
          setStatus('Local project list unavailable; checking Google Apps Script…');
          return loadCatalog(config.apiUrl);
        })
      : loadCatalog(config.apiUrl);

    return request.then(function (entries) {
      setCatalog(entries);
      return { setCatalog: setCatalog, loadCatalog: loadCatalog };
    }).catch(function (error) {
      setStatus(error.message + ' Please retry.');
      throw error;
    });
  }

  global.VoiceVoteCatalogSelector = { init: init };
})(window);
