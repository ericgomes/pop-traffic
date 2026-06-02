class Municipio {
  constructor(data) {
    this.code = String(data.code);
    this.uf = data.uf;
    this.codUf = data.codUf;
    this.name = data.name;
    this.population = data.population;
    this.isCapital = !!data.capital;
    this.normalizedName = Normalizer.normalizeName(data.name);
    this.key = this.normalizedName + '|' + this.uf;
  }

  static fromRow(row) {
    return new Municipio({
      code: row[0],
      uf: row[1],
      codUf: row[2],
      name: row[3],
      population: row[4],
      capital: row[5]
    });
  }

  get label() {
    return this.name + ' - ' + this.uf;
  }

  get classification() {
    return this.isCapital ? 'Capital' : 'Interior';
  }
}
