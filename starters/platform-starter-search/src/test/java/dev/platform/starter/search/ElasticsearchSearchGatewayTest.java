package dev.platform.starter.search;

import org.junit.jupiter.api.Test;
import org.springframework.data.elasticsearch.core.ElasticsearchOperations;
import org.springframework.data.elasticsearch.core.mapping.IndexCoordinates;
import org.springframework.data.elasticsearch.core.query.IndexQuery;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ElasticsearchSearchGatewayTest {
    @Test
    void prefixesAndValidatesIndexNames() {
        ElasticsearchOperations operations = mock(ElasticsearchOperations.class);
        when(operations.index(any(IndexQuery.class), any(IndexCoordinates.class))).thenReturn("item-1");
        ElasticsearchSearchGateway gateway = new ElasticsearchSearchGateway(operations, "catalog");

        assertThat(gateway.index("items", "item-1", new TestDocument("first"))).isEqualTo("item-1");
        verify(operations).index(
                any(IndexQuery.class),
                org.mockito.ArgumentMatchers.argThat(coordinates -> coordinates.getIndexName().equals("catalog-items"))
        );
        assertThatThrownBy(() -> gateway.delete("../unsafe", "item-1"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsUnboundedPagesBeforeCallingElasticsearch() {
        ElasticsearchSearchGateway gateway = new ElasticsearchSearchGateway(mock(ElasticsearchOperations.class), "catalog");

        assertThatThrownBy(() -> gateway.query("items", "first", TestDocument.class, -1, 20))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> gateway.query("items", "first", TestDocument.class, 0, 201))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private record TestDocument(String name) {
    }
}
