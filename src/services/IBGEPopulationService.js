class IBGEPopulationService {
  constructor(storageKey) {
    this.storageKey = storageKey || 'ibge_pop2025_meta_v1';
    this.municipios = [];
    this.byCode = new Map();
    this.byKey = new Map();
    this.byName = new Map();
    this.nameCount = new Map();
    this.ref = '';
    this.totalPopulation = 0;
    this.loaded = false;
  }

  load() {
    if (this.loaded) return this;
    const data = window.IBGE_POP2025;
    if (!data || !data.municipios) {
      throw new Error('Base de população IBGE (POP2025) não encontrada.');
    }
    this.ref = data.ref;
    this.totalPopulation = data.total;
    for (const row of data.municipios) {
      const m = Municipio.fromRow(row);
      this.municipios.push(m);
      this.byCode.set(m.code, m);
      this._push(this.byKey, m.key, m);
      this._push(this.byName, m.normalizedName, m);
      this.nameCount.set(m.normalizedName, (this.nameCount.get(m.normalizedName) || 0) + 1);
    }
    this._persistMeta();
    this.loaded = true;
    return this;
  }

  _push(map, key, value) {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(value);
  }

  _persistMeta() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify({
        ref: this.ref,
        count: this.municipios.length,
        total: this.totalPopulation
      }));
    } catch (e) {}
  }

  cachedMeta() {
    try {
      return JSON.parse(localStorage.getItem(this.storageKey));
    } catch (e) {
      return null;
    }
  }

  findByCode(code) {
    if (!code) return null;
    return this.byCode.get(String(code).trim()) || null;
  }

  findByNameUf(name, uf) {
    const key = Normalizer.normalizeName(name) + '|' + Normalizer.normalizeUf(uf);
    return this.byKey.get(key) || [];
  }

  findByName(name) {
    return this.byName.get(Normalizer.normalizeName(name)) || [];
  }

  isAmbiguousName(name) {
    return (this.nameCount.get(Normalizer.normalizeName(name)) || 0) > 1;
  }

  ufList() {
    const set = new Set();
    for (const m of this.municipios) set.add(m.uf);
    return Array.from(set).sort();
  }

  duplicateNameGroups() {
    const groups = [];
    for (const [name, count] of this.nameCount.entries()) {
      if (count > 1) {
        groups.push({ name: name, count: count, municipios: this.byName.get(name) });
      }
    }
    groups.sort((a, b) => b.count - a.count);
    return groups;
  }

  get count() {
    return this.municipios.length;
  }
}
