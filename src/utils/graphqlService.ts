interface GraphQLResponse {
  data?: {
    attestations: GraphQLAttestation[];
  };
  errors?: Array<{ message: string }>;
}

interface GraphQLAttestation {
  id: string;
  attester: string;
  recipient: string;
  revoked: boolean;
  revocable: boolean;
  refUID: string;
  data: string;
  timeCreated: string;
  expirationTime: string;
  revocationTime: string;
  schema: {
    id: string;
  };
}

export interface AttestationData {
  uid: string;
  schema: string;
  recipient: string;
  attester: string;
  revocable: boolean;
  refUID: string;
  data: string;
  time: number;
  expirationTime: number;
  revocationTime: number;
}

export class GraphQLService {
  private testnet: boolean;

  constructor(testnet: boolean) {
    this.testnet = testnet;
  }

  private getGraphQLEndpoint(): string {
    return this.testnet
      ? 'https://easscan-testnet.rootstock.io/graphql'
      : 'https://easscan.rootstock.io/graphql';
  }

  async queryAttestations(filters: {
    recipient?: string;
    attester?: string;
    schema?: string;
    limit?: number;
  }): Promise<AttestationData[]> {
    try {
      const endpoint = this.getGraphQLEndpoint();

      const query = `
        query GetAttestations($recipient: String, $attester: String, $schema: String, $limit: Int) {
          attestations(
            where: {
              ${filters.recipient ? 'recipient: $recipient,' : ''}
              ${filters.attester ? 'attester: $attester,' : ''}
              ${filters.schema ? 'schemaId: $schema,' : ''}
            }
            first: $limit
            orderBy: timeCreated
            orderDirection: desc
          ) {
            id
            attester
            recipient
            revoked
            revocable
            refUID
            data
            timeCreated
            expirationTime
            revocationTime
            schema {
              id
            }
          }
        }
      `;

      const variables = {
        recipient: filters.recipient,
        attester: filters.attester,
        schema: filters.schema,
        limit: filters.limit || 10
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      let httpResponse: Response;
      try {
        httpResponse = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query, variables }),
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!httpResponse.ok) {
        throw new Error(`HTTP ${httpResponse.status}: ${httpResponse.statusText}`);
      }

      const response: GraphQLResponse = await httpResponse.json();

      if (response.errors) {
        throw new Error(`GraphQL errors: ${response.errors.map(e => e.message).join(', ')}`);
      }

      if (!response.data) {
        throw new Error('No data returned from GraphQL query');
      }

      return response.data.attestations.map(gqlAttestation => ({
        uid: gqlAttestation.id,
        schema: gqlAttestation.schema.id,
        recipient: gqlAttestation.recipient,
        attester: gqlAttestation.attester,
        revocable: gqlAttestation.revocable,
        refUID: gqlAttestation.refUID,
        data: gqlAttestation.data,
        time: parseInt(gqlAttestation.timeCreated, 10),
        expirationTime: parseInt(gqlAttestation.expirationTime, 10),
        revocationTime: parseInt(gqlAttestation.revocationTime, 10)
      }));

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown GraphQL error';
      throw new Error(`GraphQL query failed: ${errorMessage}`);
    }
  }
}