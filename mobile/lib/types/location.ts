export interface County {
  id: number;
  code: number;
  name: string;
}

export interface SubCounty {
  id: number;
  county: number;
  name: string;
}

export interface Ward {
  id: number;
  sub_county: number;
  name: string;
}