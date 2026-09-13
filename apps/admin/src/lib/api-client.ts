import {
  RequestOtpDto,
  RequestOtpResponse,
  VerifyOtpDto,
  AuthSessionDto,
  RefreshTokenDto,
  LogoutDto,
  UserAccountDto,
  PersonDetailDto,
  TreeNodeDto,
  PersonSearchQueryDto,
  PersonSearchResponseDto,
  AdminCreatePersonDto,
  AdminUpdatePersonDto,
  AdminArchivePersonDto,
  EvaluatePersonDto,
  DuplicateCandidateDto,
  DuplicateCandidateQueryDto,
  DuplicateCompareDto,
  ResolveDuplicateCandidateDto,
  MergePersonsDto,
  MergeResultDto,
  GenealogyExportQueryDto,
  GenealogyExportDto,
  ParentType,
  SpouseStatus,
} from '@kashyap/contracts';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export class ApiClient {
  private static getHeaders(token?: string): HeadersInit {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  static async requestOtp(dto: RequestOtpDto): Promise<RequestOtpResponse> {
    const res = await fetch(`${API_BASE}/auth/otp/request`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.messageNepali || data.message || 'OTP request failed');
    }
    return data;
  }

  static async verifyOtp(dto: VerifyOtpDto): Promise<AuthSessionDto> {
    const res = await fetch(`${API_BASE}/auth/otp/verify`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.messageNepali || data.message || 'OTP verification failed');
    }
    return data;
  }

  static async refreshToken(dto?: RefreshTokenDto): Promise<AuthSessionDto> {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto || {}),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.messageNepali || data.message || 'Token refresh failed');
    }
    return data;
  }

  static async logout(dto?: LogoutDto, token?: string): Promise<void> {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: this.getHeaders(token),
        body: JSON.stringify(dto || {}),
      });
    } catch {
      // Best effort logout
    }
  }

  static async getMe(token: string): Promise<UserAccountDto> {
    const res = await fetch(`${API_BASE}/auth/me`, {
      credentials: 'include',
      headers: this.getHeaders(token),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Failed to fetch user profile');
    }
    return data;
  }

  // --- Genealogy & Search ---
  static async searchPersons(query: PersonSearchQueryDto, token?: string): Promise<PersonSearchResponseDto> {
    const params = new URLSearchParams();
    if (query.query) params.append('query', query.query);
    if (query.branchId) params.append('branchId', query.branchId);
    if (query.generation) params.append('generation', String(query.generation));
    if (query.livingStatus) params.append('livingStatus', query.livingStatus);
    if (query.gender) params.append('gender', query.gender);
    if (query.moolGhar) params.append('moolGhar', query.moolGhar);
    if (query.page) params.append('page', String(query.page));
    if (query.limit) params.append('limit', String(query.limit));

    const res = await fetch(`${API_BASE}/genealogy/search?${params.toString()}`, {
      headers: this.getHeaders(token),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.messageNepali || data.message || 'Search failed');
    return data;
  }

  static async getPerson(id: string, token?: string): Promise<PersonDetailDto> {
    const res = await fetch(`${API_BASE}/genealogy/people/${id}`, {
      headers: this.getHeaders(token),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.messageNepali || data.message || 'Failed to fetch person');
    return data;
  }

  static async getTree(
    id: string,
    ancestorGenerations = 2,
    descendantGenerations = 2,
    token?: string,
  ): Promise<TreeNodeDto> {
    const res = await fetch(
      `${API_BASE}/genealogy/people/${id}/tree?ancestorGenerations=${ancestorGenerations}&descendantGenerations=${descendantGenerations}`,
      {
        headers: this.getHeaders(token),
        credentials: 'include',
      },
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.messageNepali || data.message || 'Failed to load family tree');
    return data;
  }

  static async listBranches(): Promise<Array<{ id: string; nameNepali: string; nameEnglish: string; code: string }>> {
    const res = await fetch(`${API_BASE}/genealogy/branches`);
    const data = await res.json();
    if (!res.ok) throw new Error('Failed to load branches');
    return data;
  }

  static async createPerson(dto: AdminCreatePersonDto, token: string): Promise<PersonDetailDto> {
    const res = await fetch(`${API_BASE}/genealogy/people`, {
      method: 'POST',
      headers: this.getHeaders(token),
      credentials: 'include',
      body: JSON.stringify(dto),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.messageNepali || data.message || 'Failed to create person');
    return data;
  }

  static async updatePerson(id: string, dto: AdminUpdatePersonDto, token: string): Promise<PersonDetailDto> {
    const res = await fetch(`${API_BASE}/genealogy/people/${id}`, {
      method: 'PATCH',
      headers: this.getHeaders(token),
      credentials: 'include',
      body: JSON.stringify(dto),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.messageNepali || data.message || 'Failed to update person');
    return data;
  }

  static async archivePerson(id: string, dto: AdminArchivePersonDto, token: string): Promise<void> {
    const res = await fetch(`${API_BASE}/genealogy/people/${id}/archive`, {
      method: 'POST',
      headers: this.getHeaders(token),
      credentials: 'include',
      body: JSON.stringify(dto),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.messageNepali || data.message || 'Failed to archive person');
  }

  static async addParentLink(
    childId: string,
    parentId: string,
    parentType: ParentType = ParentType.BIOLOGICAL,
    token: string,
  ): Promise<void> {
    const res = await fetch(`${API_BASE}/genealogy/people/${childId}/parents`, {
      method: 'POST',
      headers: this.getHeaders(token),
      credentials: 'include',
      body: JSON.stringify({ parentId, parentType }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.messageNepali || data.message || 'Failed to add parent link');
  }

  static async removeParentLink(childId: string, parentId: string, token: string): Promise<void> {
    const res = await fetch(`${API_BASE}/genealogy/people/${childId}/parents/${parentId}`, {
      method: 'DELETE',
      headers: this.getHeaders(token),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.messageNepali || data.message || 'Failed to remove parent link');
  }

  static async addSpouseLink(
    personId: string,
    spouseId: string,
    status: SpouseStatus = SpouseStatus.CURRENT,
    marriageDateBs: string | undefined,
    token: string,
  ): Promise<void> {
    const res = await fetch(`${API_BASE}/genealogy/people/${personId}/spouses`, {
      method: 'POST',
      headers: this.getHeaders(token),
      credentials: 'include',
      body: JSON.stringify({ spouseId, status, marriageDateBs }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.messageNepali || data.message || 'Failed to add spouse link');
  }

  static async removeSpouseLink(personId: string, spouseId: string, token: string): Promise<void> {
    const res = await fetch(`${API_BASE}/genealogy/people/${personId}/spouses/${spouseId}`, {
      method: 'DELETE',
      headers: this.getHeaders(token),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.messageNepali || data.message || 'Failed to remove spouse link');
  }

  // --- Duplicate Detection & Merge ---
  static async evaluateDuplicates(dto: EvaluatePersonDto, token: string): Promise<any[]> {
    const res = await fetch(`${API_BASE}/genealogy/duplicates/evaluate`, {
      method: 'POST',
      headers: this.getHeaders(token),
      credentials: 'include',
      body: JSON.stringify(dto),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.messageNepali || data.message || 'Failed to evaluate duplicates');
    return data;
  }

  static async listDuplicateCandidates(
    query: DuplicateCandidateQueryDto,
    token: string,
  ): Promise<{ items: DuplicateCandidateDto[]; total: number }> {
    const params = new URLSearchParams();
    if (query.status) params.append('status', query.status);
    if (query.branchId) params.append('branchId', query.branchId);
    if (query.page) params.append('page', String(query.page));
    if (query.limit) params.append('limit', String(query.limit));

    const res = await fetch(`${API_BASE}/genealogy/duplicates/candidates?${params.toString()}`, {
      headers: this.getHeaders(token),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.messageNepali || data.message || 'Failed to load duplicate queue');
    return data;
  }

  static async compareDuplicates(
    personAId: string,
    personBId: string,
    candidateId?: string,
    token?: string,
  ): Promise<DuplicateCompareDto> {
    const params = new URLSearchParams({ personAId, personBId });
    if (candidateId) params.append('candidateId', candidateId);

    const res = await fetch(`${API_BASE}/genealogy/duplicates/compare?${params.toString()}`, {
      headers: this.getHeaders(token),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.messageNepali || data.message || 'Failed to load comparison');
    return data;
  }

  static async resolveCandidate(
    candidateId: string,
    dto: ResolveDuplicateCandidateDto,
    token: string,
  ): Promise<DuplicateCandidateDto> {
    const res = await fetch(`${API_BASE}/genealogy/duplicates/candidates/${candidateId}`, {
      method: 'PATCH',
      headers: this.getHeaders(token),
      credentials: 'include',
      body: JSON.stringify(dto),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.messageNepali || data.message || 'Failed to resolve candidate');
    return data;
  }

  static async mergePersons(dto: MergePersonsDto, token: string): Promise<MergeResultDto> {
    const res = await fetch(`${API_BASE}/genealogy/duplicates/merge`, {
      method: 'POST',
      headers: this.getHeaders(token),
      credentials: 'include',
      body: JSON.stringify(dto),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.messageNepali || data.message || 'Failed to execute merge');
    return data;
  }

  static async exportGenealogy(query: GenealogyExportQueryDto, token: string): Promise<GenealogyExportDto> {
    const params = new URLSearchParams();
    if (query.branchId) params.append('branchId', query.branchId);
    if (query.generationStart) params.append('generationStart', String(query.generationStart));
    if (query.generationEnd) params.append('generationEnd', String(query.generationEnd));
    if (query.format) params.append('format', query.format);

    const res = await fetch(`${API_BASE}/genealogy/export?${params.toString()}`, {
      headers: this.getHeaders(token),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.messageNepali || data.message || 'Failed to export data');
    return data;
  }
}
